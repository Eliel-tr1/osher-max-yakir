import { BOT_COUPON_GROUP } from './fromSheet';
import type { Lead, LeadsFile, MailingPurchase, MailingWave, Purchase } from './types';

/**
 * נתוני הדגמה מומצאים לגמרי, באותו מבנה כמו הטבלה האמיתית. אין כאן אף ליד אמיתי.
 * אותו זרע בכל פעם, כדי שהבדיקות והצילומים יהיו יציבים.
 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PRODUCTS: [string, number[]][] = [
  ['Demo Lightning Pro', [29, 49, 99]],
  ['Demo Lightning Access', [5, 9]],
  ['Demo One Step Assessment - 100K - MT5', [149, 299, 599]],
  ['Demo funded activation fee', [87, 167]],
  ['Demo Instant 20K TradeLocker', [199]],
];
const TESTS = ['Demo One Step Assessment - 20K - MT5', 'Demo One Step Assessment - 100K - MT5', 'Demo One Step Access - 200K - TradeLocker', 'Demo Freedom Challenge - MT5 - 50K', 'Demo Instant 20K MT5'];
const PROCESSES = ['תהליך ראשי', 'תהליך ראשי', 'תהליך ראשי', 'הרשמה לאתגר'];
const MODES = ['שירותית', 'מכירתית', 'מכירתית', null];
const BOT = "אורגני - צ'אטבוט וואטסאפ";
const CHANNELS = ['ig', 'google', 'Klaviyo', 'vitrue'];
const YES_REASONS = ['שיחה מכירתית לפני הרכישה', 'שיחה מכירתית לפני הרכישה', 'שיחה מכירתית לפני הרכישה', 'הבוט שלח קישור לאתר', 'קישור הבוט (vitrue)', 'קופון הבוט'];
const NO_REASONS = ['לא כתב לבוט', 'לא כתב לבוט', 'לא כתב לבוט', 'קנה לפני שכתב לבוט', 'שיחה קצרה בלי קישור מהבוט', 'שיחה שירותית בלי קישור מהבוט'];
const CAMPAIGNS = ['demo_meta_lightning', 'demo_google_access', 'campaignname', '{campaignname}'];
const CODES = ['DEMO50', 'DEMO50', 'DEMO50', 'SPOOKY', 'FLASH50', 'RESET60', BOT_COUPON_GROUP];

export function demoLeadsFile(count = 900, until = new Date('2026-10-19T12:00:00+03:00')): LeadsFile {
  const rnd = seeded(20261019);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const spanMs = 45 * 24 * 60 * 60 * 1000;
  const leads: Lead[] = [];
  const purchases: Purchase[] = [];
  for (let i = 0; i < count; i++) {
    // יותר לידים לקראת הסוף, כמו בצמיחה אמיתית
    const at = new Date(until.getTime() - Math.floor(rnd() ** 1.6 * spanMs));
    const fromSite = rnd() < 0.25;
    const answered = !fromSite && rnd() < 0.6;
    const step = answered ? Math.floor(rnd() * 11) : null;
    let qStatus: string | null = null;
    if (answered && step !== null && step > 0) qStatus = step >= 9 ? 'finished' : 'started';
    if (qStatus === 'finished') qStatus = rnd() < 0.55 ? 'converted' : rnd() < 0.6 ? 'payment' : 'finished';
    if (fromSite && rnd() < 0.7) qStatus = 'payment';
    const [name, prices] = pick(PRODUCTS);
    const buys = qStatus === 'converted' || qStatus === 'payment' ? 1 + (rnd() < 0.3 ? 1 : 0) + (rnd() < 0.1 ? 1 : 0) : 0;
    const test = buys || rnd() < 0.2 ? pick(TESTS) : null;
    const status = test ? (buys && rnd() < 0.2 ? 'לקוח פעיל' : rnd() < 0.3 ? 'עבר' : 'לא עבר') : answered ? 'ליד חדש' : null;
    const old = at.getTime() <= until.getTime() - 2 * 86_400_000;
    const source = fromSite ? (rnd() < 0.7 ? test ?? name : pick(CHANNELS)) : BOT;
    const amount = buys ? pick(prices) : null;
    // הפופאפ באתר מ-19/10, ומודעות עם utm_campaign שלא מולא
    const late = at.getTime() > until.getTime() - 9 * 86_400_000;
    const campaign = late && rnd() < 0.45 ? 'popup_website' : rnd() < 0.08 ? pick(CAMPAIGNS) : null;
    const messages = answered ? (campaign === 'popup_website' && rnd() < 0.35 ? 1 + Math.floor(rnd() * 2) : Math.floor(rnd() * 25)) : rnd() < 0.5 ? 0 : null;
    const botCoupon = answered && rnd() < 0.15;
    leads.push({
      at: at.toISOString(),
      source,
      sourceGroup: source === BOT ? 'בוט וואטסאפ' : CHANNELS.includes(source) ? source : 'מהאתר (מבחן או רכישה)',
      process: pick(PROCESSES),
      status,
      qStatus,
      answered,
      // כאילו הסוכן כבר קרא את השיחות של רוב הלידים, חוץ מהאחרונים
      aiConversation: !old ? null : answered && rnd() < 0.7 ? 'yes' : 'no',
      step,
      score: answered ? Math.round(rnd() * 70) : null,
      test,
      product: buys ? name : null,
      amount,
      removedAt: rnd() < 0.01 ? new Date(at.getTime() + 3600_000).toISOString() : null,
      mode: answered && old ? pick(MODES) : null,
      campaign,
      messages,
      botCoupon,
      couponAt: botCoupon ? new Date(at.getTime() + Math.floor(rnd() * 2 * 86_400_000)).toISOString().slice(0, 10) + 'T00:00:00.000Z' : null,
      firstAt: null,
    });
    for (let k = 0; k < buys; k++) {
      const pAt = new Date(at.getTime() + Math.floor(rnd() * 5 * 86_400_000));
      const src = rnd() < 0.08 ? 'vitrue' : source;
      purchases.push({
        at: (pAt > until ? until : pAt).toISOString(),
        lead: i,
        product: k === buys - 1 ? name : pick(PRODUCTS)[0],
        amount: rnd() < 0.02 ? null : k === buys - 1 ? amount : pick(prices),
        source: src,
        sourceGroup: src === BOT ? 'בוט וואטסאפ' : CHANNELS.includes(src) ? src : 'מהאתר (מבחן או רכישה)',
        campaign: src === 'vitrue' ? pick(['demo_halloween', 'demo_welcome']) : null,
        fromLead: false,
        // כמו העמודה "של הבוט": חלק מהרכישות עוד לא הוכרעו
        bot: null,
        reason: null,
        coupon: rnd() < 0.55 ? null : pick(CODES),
        buyer: i,
      });
      const p = purchases[purchases.length - 1];
      if (rnd() > 0.06 || pAt.getTime() < until.getTime() - 2 * 86_400_000) {
        p.bot = src === 'vitrue' || rnd() < 0.25 ? 'yes' : 'no';
        p.reason = src === 'vitrue' ? 'קישור הבוט (vitrue)' : pick(p.bot === 'yes' ? YES_REASONS : NO_REASONS);
      }
    }
  }
  // המיון משנה את המיקומים, אז הרכישות מצביעות לפי המיקום אחרי המיון
  const order = leads.map((l, i) => ({ l, i })).sort((a, b) => a.l.at.localeCompare(b.l.at));
  const newIndex = new Map(order.map((x, j) => [x.i, j]));
  const sortedLeads = order.map((x) => x.l);
  for (const p of purchases) {
    p.lead = newIndex.get(p.lead!)!;
    p.buyer = p.lead;
  }
  purchases.sort((a, b) => a.at.localeCompare(b.at) || (a.lead ?? -1) - (b.lead ?? -1));
  return {
    version: 2,
    origin: 'demo',
    generatedAt: until.toISOString(),
    sheetRows: count + 37,
    purchaseRows: purchases.length + 5,
    leads: sortedLeads,
    purchases,
    ...demoMailings(rnd, until),
  };
}

/** קמפיין דיוור מומצא: ארבעה גלים, רכישות ושורת סה"כ */
function demoMailings(rnd: () => number, until: Date): { mailings: MailingPurchase[]; mailingWaves: MailingWave[] } {
  const campaign = 'demo_halloween';
  const mailings: MailingPurchase[] = [];
  const waves: MailingWave[] = [];
  let buyer = 0;
  for (let w = 0; w < 4; w++) {
    const sentAt = new Date(until.getTime() - (4 - w) * 86_400_000);
    const day = `${sentAt.getUTCDate()}/${sentAt.getUTCMonth() + 1}`;
    const wave = `גל ${w + 1} · ${day}`;
    const sent = w < 2 ? 200 : 250;
    const undelivered = 8 + Math.floor(rnd() * 40);
    const n = 6 + Math.floor(rnd() * 14);
    const first = mailings.length;
    for (let k = 0; k < n; k++) {
      const viaLink = rnd() < 0.3;
      const bot = rnd() < 0.9 ? 'yes' : 'no';
      mailings.push({
        campaign, wave, sentAt: sentAt.toISOString(), at: new Date(sentAt.getTime() + Math.floor(rnd() * 2 * 86_400_000)).toISOString(),
        buyer: rnd() < 0.2 && buyer ? buyer - 1 : buyer++, product: pick(rnd, PRODUCTS)[0], amount: Math.round(rnd() * 30000) / 100 + 5, viaLink,
        coupon: rnd() < 0.4 ? 'SPOOKY' : rnd() < 0.3 ? 'DEMO50' : null, bot, reason: viaLink ? 'קישור הבוט (vitrue)' : bot === 'yes' ? 'שיחה מכירתית לפני הרכישה' : 'שיחה קצרה בלי קישור מהבוט',
      });
    }
    waves.push(summaryRow(campaign, wave, 'wave', `${day}/2026`, sent, undelivered, mailings.slice(first)));
  }
  const first = mailings.length;
  mailings.push({ campaign, wave: 'לא נמען / לפני השליחה שלו', sentAt: null, at: until.toISOString(), buyer: buyer++, product: 'Demo Lightning Pro', amount: 49, viaLink: true, coupon: 'SPOOKY', bot: 'yes', reason: 'קישור הבוט (vitrue)' });
  waves.push(summaryRow(campaign, 'לא נמען / לפני השליחה שלו', 'others', null, null, null, mailings.slice(first)));
  const recipients = mailings.filter((m) => m.sentAt);
  const total = summaryRow(campaign, 'סה"כ נמענים', 'total', null, waves.reduce((s, w) => s + (w.sent ?? 0), 0), waves.reduce((s, w) => s + (w.undelivered ?? 0), 0), recipients);
  waves.push(total);
  return { mailings, mailingWaves: waves };
}

function pick<T>(rnd: () => number, xs: T[]): T {
  return xs[Math.floor(rnd() * xs.length)];
}

function summaryRow(campaign: string, wave: string, kind: MailingWave['kind'], sentDay: string | null, sent: number | null, undelivered: number | null, ms: MailingPurchase[]): MailingWave {
  const sum = (xs: MailingPurchase[]) => Math.round(xs.reduce((s, m) => s + (m.amount ?? 0), 0) * 100) / 100;
  const link = ms.filter((m) => m.viaLink);
  return {
    campaign, wave, kind, sentDay, sent, undelivered, delivered: sent === null || undelivered === null ? null : sent - undelivered,
    buyers: new Set(ms.map((m) => m.buyer)).size, purchases: ms.length, amount: sum(ms), viaLinkPurchases: link.length, viaLinkAmount: sum(link),
    spooky: ms.filter((m) => m.coupon === 'SPOOKY').length, bot: ms.filter((m) => m.bot === 'yes').length, note: null,
  };
}
