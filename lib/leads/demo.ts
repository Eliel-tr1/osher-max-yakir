import type { Lead, LeadsFile } from './types';

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
  ['Demo Plan A', [29, 49, 99]],
  ['Demo Plan B', [5, 9]],
  ['Demo Plan C', [149, 299, 599]],
  ['Demo Plan D', [87, 167]],
];
const TESTS = ['Demo Test 20K', 'Demo Test 100K', 'Demo Test 200K', 'Demo Access 50K', 'Demo Instant 20K'];
const PROCESSES = ['תהליך ראשי', 'תהליך ראשי', 'תהליך ראשי', 'הרשמה לאתגר'];
const MODES = ['שירות', 'מכירותי', 'מכירותי', 'גם וגם', 'אין שיחה', null, null];
const SOURCES = ["אורגני - צ'אטבוט וואטסאפ", "אורגני - צ'אטבוט וואטסאפ", "אורגני - צ'אטבוט וואטסאפ", 'Demo Source'];

export function demoLeadsFile(count = 900, until = new Date('2026-10-19T12:00:00+03:00')): LeadsFile {
  const rnd = seeded(20261019);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const spanMs = 75 * 24 * 60 * 60 * 1000;
  const leads: Lead[] = [];
  for (let i = 0; i < count; i++) {
    // יותר לידים לקראת הסוף, כמו בצמיחה אמיתית
    const at = new Date(until.getTime() - Math.floor(rnd() ** 1.6 * spanMs));
    const answered = rnd() < 0.6;
    const step = answered ? Math.floor(rnd() * 11) : null;
    let qStatus: string | null = null;
    if (answered && step !== null && step > 0) qStatus = step >= 9 ? 'finished' : 'started';
    if (qStatus === 'finished') qStatus = rnd() < 0.55 ? 'converted' : rnd() < 0.6 ? 'payment' : 'finished';
    const [name, prices] = pick(PRODUCTS);
    const converted = qStatus === 'converted';
    const payment = qStatus === 'payment';
    leads.push({
      at: at.toISOString(),
      source: pick(SOURCES),
      process: pick(PROCESSES),
      status: answered ? (rnd() < (converted ? 0.45 : 0.15) ? 'עבר' : 'לא עבר') : null,
      qStatus,
      answered,
      step,
      score: answered ? Math.round(rnd() * 70) : null,
      test: converted || (payment && rnd() < 0.3) ? pick(TESTS) : null,
      product: payment ? name : null,
      amount: converted || payment ? pick(prices) : null,
      removedAt: rnd() < 0.01 ? new Date(at.getTime() + 3600_000).toISOString() : null,
      mode: answered ? pick(MODES) : null,
    });
  }
  leads.sort((a, b) => a.at.localeCompare(b.at));
  return {
    version: 1,
    origin: 'demo',
    generatedAt: until.toISOString(),
    sheetRows: count + 37,
    duplicatesRemoved: 37,
    skippedRows: 0,
    leads,
  };
}
