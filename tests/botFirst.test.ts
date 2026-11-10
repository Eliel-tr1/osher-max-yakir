import { describe, expect, it } from 'vitest';
import type { Lead, MailingPurchase, Purchase } from '../lib/leads/types';
import {
  annotate, BEFORE_NAMES, botHero, botKpis, capabilities, mailingLevels, moneyShareSeries, NO_PRODUCT, noProductLabel, normalizeMode, purchaseFamily, salesConversation,
  withPurchasesAfterEntry,
} from '../lib/metrics';

/** "הבוט קודם" (הנחיית המנהל 3/11/2026, #27) */
function lead(p: Partial<Lead>): Lead {
  return {
    at: '2026-10-20T07:00:00.000Z', source: null, sourceGroup: 'בוט וואטסאפ', process: null, status: null, qStatus: null, answered: true, aiConversation: null,
    step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null, campaign: null, messages: null, botCoupon: false, couponAt: null,
    firstAt: null, person: 0, ...p,
  };
}
function buy(p: Partial<Purchase>): Purchase {
  return {
    at: '2026-10-22T07:00:00.000Z', lead: null, product: 'Lightning Pro', amount: 100, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: 'yes',
    reason: null, coupon: null, buyer: 0, person: 99, ...p,
  };
}
const all = { from: null, to: null };

describe('what the bot brought (section 2.1)', () => {
  const ps = [
    buy({ bot: 'yes', amount: 100, buyer: 1 }), buy({ bot: 'yes', amount: 50, buyer: 1 }), buy({ bot: 'yes', amount: null, buyer: 2 }),
    buy({ bot: 'no', amount: 200, buyer: 3 }), buy({ bot: null, amount: 50, buyer: 4 }),
  ];
  it('uses the same "של הבוט" numbers, with the share of all revenue including the undecided', () => {
    const h = botHero(ps, null);
    expect(h).toMatchObject({ paid: 150, purchases: 3, buyers: 2, avgDeal: 75, totalPaid: 400, open: { purchases: 1, paid: 50 }, change: null });
    expect(h.share).toBeCloseTo(150 / 400);
    expect(botHero(ps, [buy({ amount: 100 })]).change).toBeCloseTo(0.5);
  });
  it('gives the bot share of money per week', () => {
    const s = moneyShareSeries([buy({ at: '2026-10-19T07:00:00.000Z', amount: 30 }), buy({ at: '2026-10-19T08:00:00.000Z', bot: 'no', amount: 70 }), buy({ at: '2026-10-27T07:00:00.000Z', amount: 0 })], 'week');
    expect(s.map((x) => [x.key, x.share])).toEqual([['2026-10-18', 0.3], ['2026-10-25', null]]);
  });
  it('gives the four numbers under it the same values as the hero, with their change and weeks (#34)', () => {
    const h = botHero(ps, null);
    const k = Object.fromEntries(botKpis(ps, null).map((x) => [x.id, x]));
    expect(k.share.value).toBe(h.share);
    expect(k.purchases.value).toBe(h.purchases);
    expect(k.buyers.value).toBe(h.buyers);
    expect(k.avgDeal.value).toBe(h.avgDeal);
    expect(Object.values(k).every((x) => x.change === null)).toBe(true);

    const weeks = [buy({ at: '2026-10-19T07:00:00.000Z', amount: 30, buyer: 1 }), buy({ at: '2026-10-19T08:00:00.000Z', bot: 'no', amount: 70, buyer: 2 }), buy({ at: '2026-11-03T07:00:00.000Z', amount: 50, buyer: 3 })];
    const before = [buy({ amount: 20, buyer: 1 }), buy({ bot: 'no', amount: 80, buyer: 2 })];
    const w = Object.fromEntries(botKpis(weeks, before).map((x) => [x.id, x]));
    expect(w.purchases.weekly).toEqual([1, 0, 1]);
    expect(w.avgDeal.weekly).toEqual([30, null, 50]);
    expect(w.share.weekly).toEqual([0.3, null, 1]);
    expect(w.purchases.change).toBe(1);
    expect(w.share.change).toBeCloseTo(80 / 150 - 0.2);
  });
});

describe('what the bot does (section 2.2)', () => {
  it('splits the bot money by reason, so the first three cards never add up to more than the bot money', () => {
    const ps = [
      buy({ reason: 'שיחה מכירתית לפני הרכישה', amount: 100 }), buy({ reason: 'קופון הבוט', amount: 10 }), buy({ reason: 'קופון הבוט (נוצר לאיש קשר אחר של הלקוח)', amount: 5 }),
      buy({ reason: 'הבוט שלח קופון או קישור רכישה', amount: 20 }), buy({ reason: 'הבוט שלח קישור לאתר', amount: 30 }), buy({ reason: 'קישור הבוט (vitrue)', amount: 40 }),
      // לא של הבוט: לא נספר גם כשהסיבה מתאימה
      buy({ bot: 'no', reason: 'שיחה מכירתית לפני הרכישה', amount: 1000 }),
    ];
    const leads = annotate({ version: 2, origin: 'demo', generatedAt: '', sheetRows: 3, purchaseRows: 0, leads: [lead({ mode: 'מכירתי' }), lead({ mode: 'מכירתית - קנה' }), lead({ mode: 'שירותית' })], purchases: [], mailings: null, mailingWaves: null, dupes: [], insights: { analysis: null, questions: null, inquiries: null, feedback: null, stalls: null } });
    const c = capabilities({ leads, couponLeads: [], purchases: ps, people: [], mailings: null, range: all });
    expect([c.sales.count, c.sales.paid]).toEqual([2, 100]);
    expect(c.coupons.paid).toBe(15);
    expect([c.links.count, c.links.paid]).toEqual([2, 50]);
    expect(c.sales.paid + c.coupons.paid + c.links.paid).toBeLessThanOrEqual(botHero(ps, null).paid);
  });

  it('counts "מכירתי" as a sales conversation, by the first word (section 3.5)', () => {
    expect(normalizeMode('מכירתי')).toBe('מכירתית');
    expect(salesConversation(lead({ mode: 'מכירתית, ניסה לקנות' }))).toBe(true);
    expect(salesConversation(lead({ mode: 'שירותי' }))).toBe(false);
  });

  it('counts the popup by real conversations and the bot money after entry', () => {
    const file = {
      version: 2 as const, origin: 'demo' as const, generatedAt: '', sheetRows: 2, purchaseRows: 1,
      leads: [lead({ campaign: 'popup_website', aiConversation: 'yes', person: 1 }), lead({ campaign: 'popup_website', aiConversation: 'no', person: 2 })],
      purchases: [buy({ person: 1, amount: 80 })], mailings: null, mailingWaves: null, dupes: [], insights: { analysis: null, questions: null, inquiries: null, feedback: null, stalls: null },
    };
    const people = withPurchasesAfterEntry(annotate(file), file.purchases);
    const c = capabilities({ leads: [], couponLeads: [], purchases: [], people, mailings: null, range: all });
    expect([c.popup.count, c.popup.paid]).toEqual([1, 80]);
  });
});

describe('mailing levels (section 2.4)', () => {
  const m = (p: Partial<MailingPurchase>): MailingPurchase => ({
    campaign: 'c', wave: 'גל 1', sentAt: '2026-10-28T09:00:00.000Z', at: '2026-10-28T12:00:00.000Z', buyer: 0, product: null, amount: 10, viaLink: false, coupon: null, bot: 'yes', reason: null, ...p,
  });
  it('splits recipients up to 72 hours after sending: via the link, only SPOOKY, and the rest', () => {
    const rows = [
      m({ viaLink: true, coupon: 'SPOOKY' }), m({ viaLink: true }), m({ coupon: 'SPOOKY' }), m({}), m({ coupon: 'PASS50' }),
      m({ at: '2026-10-31T10:00:00.000Z' }), m({ sentAt: null }), m({ at: '2026-10-28T08:00:00.000Z' }),
    ];
    const v = mailingLevels(rows);
    expect([v.link.length, v.spooky.length, v.rest.length]).toEqual([2, 1, 2]);
  });
});

describe('purchases without a product name (section 3.3)', () => {
  it('are "before 20/10" until the names started, and "not given" after', () => {
    expect(noProductLabel('2026-10-19T20:00:00.000Z')).toBe(BEFORE_NAMES);
    expect(noProductLabel('2026-10-19T22:00:00.000Z')).toBe(NO_PRODUCT);
    expect(purchaseFamily(buy({ product: null, amount: 12, at: '2026-10-05T10:00:00.000Z' }))).toBe(BEFORE_NAMES);
    expect(purchaseFamily(buy({ product: null, amount: 109, at: '2026-10-05T10:00:00.000Z' }))).toBe('דמי הפעלה (activation fee)');
  });
});
