import type { Lead, LeadsFile, Purchase } from './types';

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
        bot: rnd() < 0.2 ? null : src === 'vitrue' || rnd() < 0.25 ? 'yes' : 'no',
      });
    }
  }
  // המיון משנה את המיקומים, אז הרכישות מצביעות לפי המיקום אחרי המיון
  const order = leads.map((l, i) => ({ l, i })).sort((a, b) => a.l.at.localeCompare(b.l.at));
  const newIndex = new Map(order.map((x, j) => [x.i, j]));
  const sortedLeads = order.map((x) => x.l);
  for (const p of purchases) p.lead = newIndex.get(p.lead!)!;
  purchases.sort((a, b) => a.at.localeCompare(b.at) || (a.lead ?? -1) - (b.lead ?? -1));
  return {
    version: 2,
    origin: 'demo',
    generatedAt: until.toISOString(),
    sheetRows: count + 37,
    purchaseRows: purchases.length + 5,
    leads: sortedLeads,
    purchases,
  };
}
