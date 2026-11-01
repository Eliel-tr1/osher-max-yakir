import { describe, expect, it } from 'vitest';
import type { Lead, LeadsFile, MailingPurchase, MailingWave, Purchase } from '../lib/leads/types';
import {
  annotate, BOT_COUPON_GROUP, botBreakdown, botCoupons, botCouponSeries, botSeries, buyItems, byReason, campaigns, couponRows, isActivation, mailingCampaigns,
  mailingView, popupCompare, popupFunnel, purchaseFamily, purchaseGaps, reasonOf, repeatBuyers, trackingHealth, UNDECIDED, usedBotCoupon, withPurchasesAfterEntry,
  ACTIVATION, funnel, summarize,
} from '../lib/metrics';

function lead(p: Partial<Lead>): Lead {
  return {
    at: '2026-10-20T07:00:00.000Z', source: null, sourceGroup: null, process: null, status: null, qStatus: null, answered: false, aiConversation: null,
    step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null, campaign: null, messages: null, botCoupon: false, couponAt: null,
    firstAt: null, ...p, person: p.person ?? -1,
  };
}
function buy(p: Partial<Purchase> & { buyer: number }): Purchase {
  return {
    at: '2026-10-22T07:00:00.000Z', lead: null, product: null, amount: null, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: null,
    reason: null, coupon: null, ...p, person: p.person ?? -1,
  };
}
/** אדם = הליד, אלא אם נקבע אחרת בבדיקה */
function file(leads: Lead[], purchases: Purchase[]): LeadsFile {
  leads.forEach((l, i) => { if (l.person === -1) l.person = i; });
  purchases.forEach((p, k) => { if (p.person === -1) p.person = p.lead ?? 100_000 + k; });
  return { version: 2, origin: 'demo', generatedAt: '', sheetRows: leads.length, purchaseRows: purchases.length, leads, purchases, mailings: null, mailingWaves: null, dupes: [] };
}
const all = { from: null, to: null };

describe('purchases by "של הבוט"', () => {
  const ps = [
    buy({ buyer: 1, bot: 'yes', amount: 100, reason: 'שיחה מכירתית לפני הרכישה' }),
    buy({ buyer: 1, bot: 'yes', amount: 50, reason: 'שיחה מכירתית לפני הרכישה' }),
    buy({ buyer: 2, bot: 'no', amount: 30, reason: 'לא כתב לבוט' }),
    buy({ buyer: 3, bot: 'no', amount: null, reason: 'לא כתב לבוט' }),
    buy({ buyer: 3, bot: null, amount: 20 }),
    buy({ buyer: 4, bot: 'yes', amount: 10, reason: 'קופון הבוט' }),
  ];
  it('splits all, yes, no and undecided, with buyers, per buyer and the bot share', () => {
    const b = botBreakdown(ps);
    expect(b.all).toEqual({ purchases: 6, paid: 210, buyers: 4, perBuyer: 1.5, paidPerBuyer: 52.5, avgDeal: 42 });
    expect(b.yes).toMatchObject({ purchases: 3, paid: 160, buyers: 2, perBuyer: 1.5, paidPerBuyer: 80 });
    expect(b.no).toMatchObject({ purchases: 2, paid: 30, buyers: 2, avgDeal: 30 });
    expect(b.open).toMatchObject({ purchases: 1, paid: 20, buyers: 1 });
    expect(b.share.purchases).toBeCloseTo(0.5);
    expect(b.share.paid).toBeCloseTo(160 / 210);
  });
  it('breaks down by reason: yes first, then no, then undecided', () => {
    const rows = byReason(ps);
    expect(rows.map((r) => [r.name, r.side, r.purchases, r.paid, r.buyers])).toEqual([
      ['שיחה מכירתית לפני הרכישה', 'yes', 2, 150, 1],
      ['קופון הבוט', 'yes', 1, 10, 1],
      ['לא כתב לבוט', 'no', 2, 30, 2],
      [UNDECIDED, 'open', 1, 20, 1],
    ]);
    expect(reasonOf({ reason: null, bot: 'yes' })).toBe('בלי סיבה');
  });
  it('draws a stacked series in count or money', () => {
    expect(botSeries(ps, 'day', 'count')).toEqual([{ key: '2026-10-22', values: [3, 2, 1] }]);
    expect(botSeries(ps, 'day', 'money')).toEqual([{ key: '2026-10-22', values: [160, 30, 20] }]);
  });
  it('counts purchases per buyer, for the bot and for the rest', () => {
    const r = repeatBuyers([...ps, ...[1, 2, 3, 4, 5].map(() => buy({ buyer: 9, bot: 'no' }))]);
    expect(r).toEqual([
      { name: '1', bot: 1, other: 1 },
      { name: '2', bot: 1, other: 1 },
      { name: '3', bot: 0, other: 0 },
      { name: '4', bot: 0, other: 0 },
      { name: '5+', bot: 0, other: 1 },
    ]);
  });
  it('lists purchases newest first, with the campaign of the purchase or else of the lead', () => {
    const leads = [lead({ campaign: 'popup_website' })];
    const items = buyItems([buy({ buyer: 1, lead: 0, at: '2026-10-01T07:00:00.000Z' }), buy({ buyer: 1, lead: 0, campaign: 'halloween_lightning', bot: 'yes', reason: 'x' })], leads);
    expect(items.map((i) => [i.campaign, i.reason, i.side])).toEqual([['halloween_lightning', 'x', 'yes'], ['popup_website', UNDECIDED, 'open']]);
    expect(JSON.stringify(items)).not.toMatch(/buyer|lead/);
    // "קמפיינים מובילים": רק הקמפיין של הרכישה עצמה. בלי P = "בלי קמפיין", גם כשלאדם יש קמפיין (1/11)
    expect(campaigns([buy({ buyer: 1, lead: 0 }), buy({ buyer: 2, campaign: 'halloween_lightning' })]).map((c) => [c.name, c.count])).toEqual([['halloween_lightning', 1], ['בלי קמפיין', 1]]);
  });
  it('finds the first day and the days without any row', () => {
    const g = purchaseGaps([buy({ buyer: 1, at: '2026-09-30T08:00:00.000Z' }), buy({ buyer: 1, at: '2026-10-02T08:00:00.000Z' }), buy({ buyer: 1, at: '2026-09-01T08:00:00.000Z', fromLead: true })]);
    expect(g).toEqual({ first: '2026-09-30', missing: ['2026-10-01'] });
  });
});

describe('activation fee', () => {
  it('is a product with "activation", or no product and one of the activation amounts', () => {
    expect(isActivation({ product: 'access funded activation fee', amount: 5 })).toBe(true);
    expect(isActivation({ product: 'Funded Activation', amount: null })).toBe(true);
    expect(isActivation({ product: null, amount: 169 })).toBe(true);
    expect(isActivation({ product: null, amount: 170 })).toBe(false);
    expect(isActivation({ product: 'Lightning Pro', amount: 169 })).toBe(false);
    expect(purchaseFamily(buy({ buyer: 1, amount: 399 }))).toBe(ACTIVATION);
  });
});

describe('coupons', () => {
  it('ranks the codes by count or by money, with how many were of the bot', () => {
    const ps = [
      buy({ buyer: 1, coupon: 'PASS50', amount: 10, bot: 'yes' }), buy({ buyer: 2, coupon: 'PASS50', amount: 10 }), buy({ buyer: 3, coupon: 'SPOOKY', amount: 100 }),
      buy({ buyer: 4, coupon: BOT_COUPON_GROUP, amount: 5, bot: 'yes', reason: 'קופון הבוט (נוצר לאיש קשר אחר של הלקוח)' }), buy({ buyer: 5 }),
    ];
    expect(couponRows(ps).map((r) => [r.name, r.purchases, r.paid, r.bot])).toEqual([['PASS50', 2, 20, 1], ['SPOOKY', 1, 100, 0], ['קופון אישי של הבוט', 1, 5, 1]]);
    expect(couponRows(ps, 'money')[0].name).toBe('SPOOKY');
    expect(ps.filter(usedBotCoupon)).toHaveLength(1);
  });
  it('counts the bot coupons made by date, and the use rate', () => {
    const leads = [
      lead({ botCoupon: true, couponAt: '2026-10-20T21:00:00.000Z' }), lead({ botCoupon: true, couponAt: '2026-10-25T21:00:00.000Z' }), lead({ botCoupon: true }),
      lead({ botCoupon: false, couponAt: '2026-10-20T21:00:00.000Z' }),
    ];
    // שימוש = קוד אישי של הבוט ברכישה, גם כשהסיבה אחרת
    const ps = [buy({ buyer: 1, coupon: BOT_COUPON_GROUP, reason: 'שיחה מכירתית לפני הרכישה', amount: 20 }), buy({ buyer: 2, reason: 'קופון הבוט' })];
    expect(botCoupons(leads, ps, all)).toEqual({ made: 3, undated: 1, used: 1, usedPaid: 20, rate: 1 / 3 });
    const oct = { from: new Date('2026-10-24T00:00:00.000Z'), to: null };
    expect(botCoupons(leads, ps, oct).made).toBe(1);
    expect(botCouponSeries(leads, all, 'day').map((d) => d.values[0]).reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('the popup funnel', () => {
  const leads = [
    // נכנס מהפופאפ, קנה לפני הכניסה וגם אחריה (קונה חוזר)
    lead({ campaign: 'popup_website', at: '2026-10-21T07:00:00.000Z', messages: 5, aiConversation: 'yes', mode: 'מכירתית' }),
    // שורה ראשונה שלו מוקדמת יותר: זמן הכניסה הוא המוקדם
    lead({ campaign: 'popup_website', at: '2026-10-25T07:00:00.000Z', firstAt: '2026-10-20T07:00:00.000Z', messages: 1, aiConversation: 'no' }),
    lead({ campaign: 'popup_website', at: '2026-10-22T07:00:00.000Z', messages: 2, aiConversation: 'yes', mode: 'שירותית' }),
    lead({ campaign: 'popup_website', at: '2026-10-23T07:00:00.000Z', messages: 1 }),
    // לא מהפופאפ
    lead({ at: '2026-10-22T07:00:00.000Z', aiConversation: 'yes', sourceGroup: 'בוט וואטסאפ' }),
    lead({ at: '2026-10-02T07:00:00.000Z', aiConversation: 'yes' }),
  ];
  const purchases = [
    buy({ buyer: 0, lead: 0, at: '2026-10-10T07:00:00.000Z', amount: 99, bot: 'no' }),
    buy({ buyer: 0, lead: 0, at: '2026-10-21T15:00:00.000Z', amount: 50, bot: 'yes' }),
    buy({ buyer: 0, lead: 0, at: '2026-10-30T15:00:00.000Z', amount: 25, bot: 'no' }),
    buy({ buyer: 1, lead: 1, at: '2026-10-23T07:00:00.000Z', amount: 10, bot: 'yes' }),
    buy({ buyer: 4, lead: 4, at: '2026-10-23T07:00:00.000Z', amount: 10 }),
  ];
  const people = withPurchasesAfterEntry(annotate(file(leads, purchases)), purchases);

  it('finds a returning buyer who bought before under another id with the same phone', () => {
    const ls = [lead({ campaign: 'popup_website', at: '2026-10-25T07:00:00.000Z', person: 7 })];
    const ps = [
      // קוד מזהה אחר (לא בלשונית הלידים), אותו אדם
      buy({ buyer: 1, lead: null, person: 7, at: '2026-10-15T07:00:00.000Z', amount: 50 }),
      buy({ buyer: 0, lead: 0, person: 7, at: '2026-10-26T07:00:00.000Z', amount: 20 }),
    ];
    const x = withPurchasesAfterEntry(annotate(file(ls, ps)), ps);
    expect(popupFunnel(x)).toMatchObject({ buyers: 1, newBuyers: 0, returningBuyers: 1, purchases: 1, paid: 20 });
  });
  const popup = people.filter((x) => x.lead.campaign === 'popup_website');

  it('counts every step', () => {
    const f = popupFunnel(popup);
    expect(f).toMatchObject({
      entered: 4, onlySentence: 2, twoMessages: 1, real: 2, realSales: 1, realService: 1, buyers: 2, newBuyers: 1, returningBuyers: 1,
      purchases: 3, paid: 85, botPurchases: 2, botPaid: 60,
    });
    expect(f.avgDeal).toBeCloseTo(85 / 3);
    // קונה 0: 8 שעות אחרי הכניסה; קונה 1: 3 ימים אחרי הכניסה המוקדמת
    expect(f.timeToBuy.map((t) => t.count)).toEqual([1, 1, 0, 0]);
  });
  it('compares to people who did not come from the popup, from the popup start on', () => {
    const c = popupCompare(people, all);
    expect(c.from).toBe('2026-10-19');
    expect(c.popup).toMatchObject({ people: 4, scanned: 3, real: 2, buyers: 2, buyRate: 0.5 });
    expect(c.others).toMatchObject({ people: 1, scanned: 1, real: 1, buyers: 1 });
    expect(c.bot).toMatchObject({ people: 1, real: 1 });
  });
});

describe('mailings', () => {
  const W = (p: Partial<MailingWave>): MailingWave => ({
    campaign: 'h', wave: '', kind: 'wave', sentDay: null, sent: null, undelivered: null, delivered: null, buyers: null, purchases: null, amount: null,
    viaLinkPurchases: null, viaLinkAmount: null, spooky: null, bot: null, note: null, ...p,
  });
  const M = (p: Partial<MailingPurchase> & { buyer: number }): MailingPurchase => ({
    campaign: 'h', wave: 'גל 1', sentAt: '2026-10-28T09:00:00.000Z', at: '2026-10-28T10:00:00.000Z', product: null, amount: 10, viaLink: false, coupon: null, bot: 'yes', reason: null, ...p,
  });
  it('uses the total row, keeps the non recipients apart, and counts the link buyers', () => {
    const waves = [W({ wave: 'גל 1', sent: 200, delivered: 186, undelivered: 14 }), W({ wave: 'לא נמען', kind: 'others', purchases: 1 }), W({ wave: 'סה"כ', kind: 'total', sent: 900, delivered: 779 })];
    const ms = [M({ buyer: 0, viaLink: true, coupon: 'SPOOKY' }), M({ buyer: 0, viaLink: true }), M({ buyer: 1, coupon: 'PASS50' }), M({ buyer: 2, sentAt: null, viaLink: true }), M({ buyer: 3, campaign: 'other' })];
    expect(mailingCampaigns(waves, ms)).toEqual(['h', 'other']);
    const v = mailingView('h', waves, ms);
    expect(v.total.sent).toBe(900);
    expect(v.waves).toHaveLength(1);
    expect(v.recipients).toHaveLength(3);
    expect(v.nonRecipients).toHaveLength(1);
    expect(v.linkBuyers).toBe(1);
    expect(v.coupons).toEqual({ spooky: 1, other: 1, none: 1 });
  });
  it('adds up the waves when there is no total row', () => {
    const v = mailingView('h', [W({ sent: 200, delivered: 190 }), W({ sent: 250, delivered: 200 })], []);
    expect(v.total).toMatchObject({ sent: 450, delivered: 390, buyers: null });
  });
});

describe('campaign tracking health', () => {
  it('finds unfilled ad codes, also in the last 7 days', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const leads = ['campaignname', '{campaignname}', '{{campaign.name}}', 'Campaign_Name', 'adset.name', 'popup_website', '[UK] - CBO - 27/07', 'campaignnames']
      .map((campaign, i) => lead({ campaign, at: i === 1 ? '2026-10-30T12:00:00.000Z' : '2026-10-01T12:00:00.000Z' }));
    const h = trackingHealth(leads, now);
    expect(h.total).toBe(5);
    expect(h.last7).toBe(1);
    expect(h.byValue.find((v) => v.name === '{campaignname}')).toEqual({ name: '{campaignname}', count: 1, last7: 1 });
  });
});

describe('people who bought on the site without the bot (1/11)', () => {
  it('are out of the funnel and the conversion rate, and counted apart', () => {
    const leads = [
      // נוצר ברגע הרכישה באתר
      lead({ at: '2026-10-20T10:05:00.000Z', answered: false }),
      // נוצר 9 דקות לפני הרכישה: עדיין קונה מהאתר
      lead({ at: '2026-10-20T09:51:00.000Z' }),
      // נכנס לבוט יום לפני ואז קנה
      lead({ at: '2026-10-19T10:00:00.000Z', answered: true, step: 3, qStatus: 'finished' }),
      // כמה שורות: הכניסה הראשונה מוקדמת, ולכן הוא לא קונה מהאתר
      lead({ at: '2026-10-20T10:01:00.000Z', firstAt: '2026-10-10T10:00:00.000Z', answered: true }),
      // רק רכישה משורת ליד (בלי תאריך אמיתי): נשאר במשפך
      lead({ at: '2026-10-20T10:00:00.000Z', qStatus: 'converted', answered: true }),
      lead({ at: '2026-10-20T10:00:00.000Z' }),
    ];
    const ps = [
      buy({ buyer: 0, lead: 0, at: '2026-10-20T10:00:00.000Z' }),
      buy({ buyer: 1, lead: 1, at: '2026-10-20T10:00:00.000Z' }),
      buy({ buyer: 2, lead: 2, at: '2026-10-20T10:00:00.000Z' }),
      buy({ buyer: 3, lead: 3, at: '2026-10-20T10:00:00.000Z' }),
      buy({ buyer: 4, lead: 4, at: '2026-10-20T10:00:00.000Z', fromLead: true }),
    ];
    const x = annotate(file(leads, ps));
    expect(x.map((l) => l.siteBuyer)).toEqual([true, true, false, false, false, false]);
    const s = summarize(x, ps);
    expect(s).toMatchObject({ leads: 4, siteBuyers: 2, leadsWhoBought: 3, purchases: 5 });
    const f = funnel(x);
    expect(f.leads).toBe(4);
    // במשפך רק מי שגם סיים שאלון: ליד 2 וליד 4 (converted)
    expect(f.bought).toBe(2);
    expect(f.started).toBeGreaterThanOrEqual(f.startedQ);
    expect(f.finishedQ).toBeGreaterThanOrEqual(f.bought);
  });
});
