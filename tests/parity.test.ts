import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pack } from '../lib/leads/file';
import { leadsFromRows, MAILING_COLUMNS, MAILING_WAVE_COLUMNS, OPTIONAL_COLUMNS, PURCHASE_COLUMNS, REQUIRED_COLUMNS } from '../lib/leads/fromSheet';
import { parseCsv } from '../lib/sheet/parse';

/**
 * השרת מעבד את הטבלה ב-PHP (public/_leads.php), והבנייה בגיטהאב ב-TypeScript.
 * הבדיקה הזו מריצה את שניהם על אותן טבלאות מדומות ודורשת תוצאה זהה.
 */
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const two = (x: number) => String(x).padStart(2, '0');
const PRODUCTS = ['', '-', ' - ', 'Lightning Pro', 'Lightning challenge 1 step<span> - </span>MT5, 100k', 'funded activation fee', 'שורה\nשנייה', 'בדיקת n8n', 'Instant'];
const TESTS = ['', 'One Step Assessment - 100K - MT5', 'Freedom Challenge - MT5 - 20k'];
const SOURCES = ["אורגני - צ'אטבוט וואטסאפ", 'צאטבוט', '  ריווח מיוחד  ', 'Lightning Pro', 'ig', 'vitrue', 'One Step Assessment - 100K - MT5', ''];

/** טבלת לידים מדומה עם כל המקרים הקשים: מרכאות, שורות בתוך תא, HTML, כפילויות, תאריכים שבורים וישנים, רווחים מיוחדים */
const COUPONS = ['', '-', 'empty', 'EMPTY', ' pass50 ', '{"code":"spooky","discount":"10"}', '{"code":"","discount":""}', '{"discount":"5"}', '{bad json',
  'PTB-1A2B3C4D5E', 'ptb-1a2b3c4d5e', 'PTB-FLASH25', '{"code":"PTB-00FF00FF00"}', '{"code":null}'];

function fixture(n: number, extraHeader = true): { leads: string; purchases: string } {
  const rnd = seeded(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const header = ['שם לקוח', ...REQUIRED_COLUMNS, 'טלפון', 'מייל', 'הערות', ...(extraHeader ? ['עמודה עתידית', ...OPTIONAL_COLUMNS] : [])];
  const pheader = ['שם לקוח', ...PURCHASE_COLUMNS, 'טלפון', ...(extraHeader ? ['קופון מהרכישה', 'utm_campaign', 'של הבוט', 'סיבה'] : [])];
  const lines = [`﻿${header.map(q).join(',')}`];
  const plines = [pheader.map(q).join(',')];
  const date = (year = 2026) => {
    const day = 1 + Math.floor(rnd() * 28);
    const month = pick([3, 8, 9, 10, 11]); // כולל מעבר שעון קיץ/חורף ותאריכים לפני ההשקה
    return `${two(day)}/${two(month)}/${year} ${two(Math.floor(rnd() * 24))}:${two(Math.floor(rnd() * 60))}:${two(Math.floor(rnd() * 60))}`;
  };
  for (let i = 0; i < n; i++) {
    const id = rnd() < 0.03 ? '' : `ID${i}`;
    const amount = pick(['', '99', '99.99', '- 990', '€2,400', '.', '0', '29']);
    const v: Record<string, string> = {
      'שם לקוח': pick(['ישראל ישראלי', ' ', 'Test, "Name"']),
      'קוד מזהה': id,
      'תאריך כניסה': rnd() < 0.02 ? pick(['', '31/02/2026', '2026-10-01', 'לא תאריך']) : date(rnd() < 0.03 ? 2025 : 2026),
      טלפון: pick(['0501111111', '+972-50-111-1111', '']),
      מייל: pick(['', 'A@Example.com', 'b@example.com']),
      'מקור הגעה': pick(SOURCES),
      סטטוס: pick(['', 'עבר', 'לא עבר', 'ליד חדש', 'לקוח פעיל']),
      'הסיר את עצמו?': rnd() < 0.05 ? pick(['24/09/2026 11:58', 'כן']) : '',
      "ענה לצ'אטבוט?": pick(['', 'כן']),
      'שלב בשאלון': pick(['', '0', '3', '10', '2.5', 'abc']),
      'סטטוס שאלון': pick(['', 'Converted', 'payment', 'finished', 'started', 'irrelevant']),
      'שם תהליך': pick(['תהליך ראשי', 'הרשמה לאתגר', '']),
      'ניקוד לקוח': pick(['', '12', '70', '-3']),
      מבחן: pick(TESTS),
      'מוצר שנקנה': pick(PRODUCTS),
      'סכום ששולם': amount,
      הערות: pick(['', 'הערה "פנימית"', 'a,b']),
      'עמודה עתידית': 'x',
      'התחיל שיחה': pick(['', 'כן', 'לא', 'TRUE', 'false', '0']),
      'אופן שיחה': pick(['', 'שירותית', 'מכירתי', 'מכירתית', 'אין שיחה']),
      utm_campaign: pick(['', '', 'popup_website', 'campaignname', '{campaignname}', ' [UK] - CBO - 27/07 ']),
      'הודעות לקוח': pick(['', '0', '1', '2', '17', 'x']),
      'קופון הבוט': pick(['', '', '', 'PTB-1A2B3C4D5E']),
      'תאריך קופון': pick(['', '28/10/2026', '1/9/2026', 'לא תאריך']),
    };
    lines.push(header.map((h) => q(v[h] ?? '')).join(','));
    if (rnd() < 0.15) {
      // כפילות: אותו קוד מזהה, אותה שנייה או כמה שניות אחרי, עם פחות או יותר נתונים
      const copy: Record<string, string> = {
        ...v, הערות: rnd() < 0.5 ? '' : 'עוד', 'סטטוס שאלון': pick([v['סטטוס שאלון'], 'converted']), 'תאריך כניסה': rnd() < 0.5 ? v['תאריך כניסה'] : date(),
      };
      lines.push(header.map((h) => q(copy[h] ?? '')).join(','));
    }
    if (rnd() < 0.03) lines.push(header.map(() => '').join(','));
    // רכישות: לרוב הקונים שורה או שתיים, לפעמים כפולה, לפעמים בלי שם מוצר או בלי סכום
    const buys = rnd() < 0.5 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0;
    for (let k = 0; k < buys; k++) {
      const d = date(rnd() < 0.02 ? 2023 : 2026).slice(0, 16);
      const p: Record<string, string> = {
        'שם לקוח': v['שם לקוח'], תאריך: d, 'קוד מזהה': rnd() < 0.05 ? `OTHER${i}` : id, 'מקור הגעה': pick(SOURCES),
        'מוצר שנקנה': rnd() < 0.3 ? pick(['', '-']) : pick(PRODUCTS), 'סכום ששולם': rnd() < 0.3 ? amount : pick(['', '5', '14', '169']),
        טלפון: v['טלפון'], 'קופון מהרכישה': pick(['', 'pass50', '{"code":"","discount":""}']), utm_campaign: pick(['', 'halloween_lightning']),
        'של הבוט': pick(['', 'כן', ' כן ', 'לא', 'yes', 'כן.', '\u00a0כן\u00a0', 'כ ן']),
        'קופון מהרכישה': pick(COUPONS),
        סיבה: pick(['', 'שיחה מכירתית לפני הרכישה', 'לא כתב לבוט', ' קופון הבוט (נוצר לאיש קשר אחר של הלקוח) ']),
      };
      plines.push(pheader.map((h) => q(p[h] ?? '')).join(','));
      if (rnd() < 0.2) {
        const [dd, hm] = d.split(' ');
        const [hh, mm] = hm.split(':').map(Number);
        const again: Record<string, string> = { ...p, תאריך: `${dd} ${two(hh)}:${two(Math.min(59, mm + (rnd() < 0.5 ? 1 : 5)))}` };
        plines.push(pheader.map((h) => q(again[h] ?? '')).join(','));
      }
    }
  }
  return { leads: lines.join(rnd() < 0.5 ? '\r\n' : '\n'), purchases: plines.join('\r\n') };
}

/** לשוניות "דיוורים" ו"דיוורים - סיכום" מדומות */
function mailingFixture(): { mailings: string; waves: string } {
  const rnd = seeded(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const mh = [...MAILING_COLUMNS, 'לינק לשיחה'];
  const ml = [mh.map(q).join(',')];
  for (let i = 0; i < 80; i++) {
    const recipient = rnd() < 0.9;
    const v: Record<string, string> = {
      קמפיין: pick(['halloween_lightning', 'halloween_lightning', 'black_friday']), גל: recipient ? pick(['גל 1 · 28/10', 'גל 2 · 29/10']) : 'לא נמען / לפני השליחה שלו',
      'תאריך שליחה': recipient ? pick(['28/10/2026 11:00', '29/10/2026 09:30']) : '', 'תאריך רכישה': pick(['28/10/2026 12:15', '30/10/2026 08:01', '', 'שבור']),
      'קוד מזהה': pick(['A', 'B', 'C', '', 'D']), מוצר: pick(['Lightning Pro', 'Instant Funding account<span> - </span>MT5, 5k', '']), סכום: pick(['169', '19.37', '', '€2,400']),
      'דרך קישור הקמפיין': pick(['כן', 'לא', '']), קופון: pick(COUPONS), 'של הבוט': pick(['כן', 'לא', '']), סיבה: pick(['קישור הבוט (vitrue)', '']), 'לינק לשיחה': 'https://example.com/x',
    };
    ml.push(mh.map((h) => q(v[h] ?? '')).join(','));
  }
  const wl = [MAILING_WAVE_COLUMNS.map(q).join(',')];
  wl.push(['halloween_lightning', 'גל 1 · 28/10', '28/10/2026', '200', '14', '186', '18', '23', '2367.22', '3', '93.55', '5', '22', 'שידור אחד, "מהיר"'].map(q).join(','));
  wl.push(['halloween_lightning', 'לא נמען / לפני השליחה שלו', '', '', '', '', '2', '2', '85.5', '2', '85.5', '2', '2', ''].map(q).join(','));
  wl.push(['halloween_lightning', 'סה"כ נמענים', '28-31/10/2026', '900', '121', '779', '47', '58', '5436.28', '18', '630.99', '20', '54', 'הערה'].map(q).join(','));
  return { mailings: ml.join('\r\n'), waves: wl.join('\n') };
}

function viaPhp(leads: string, at: string, purchases?: string, mailings?: string, waves?: string): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const write = (name: string, text: string | undefined) => {
    if (text === undefined) return '-';
    const f = join(dir, name);
    writeFileSync(f, text);
    return f;
  };
  const args = [write('leads.csv', leads), at, write('purchases.csv', purchases), write('mailings.csv', mailings), write('waves.csv', waves)];
  return JSON.parse(execFileSync('php', ['scripts/php-leads.php', ...args], { encoding: 'utf8', maxBuffer: 50e6 }));
}

describe.skipIf(!php)('PHP on the server gives exactly the same data as TypeScript', () => {
  const at = '2026-10-19T12:00:00.000Z';

  it('on large messy sheets', () => {
    const { leads, purchases } = fixture(1500);
    const ts = JSON.parse(pack(leadsFromRows(parseCsv(leads), parseCsv(purchases), new Date(at))));
    const ph = viaPhp(leads, at, purchases);
    expect(ts.leads.length).toBeGreaterThan(600);
    expect(ts.purchases.length).toBeGreaterThan(400);
    expect(ts.purchases.some((p: { fromLead: boolean }) => p.fromLead)).toBe(true);
    expect(ts.purchases.some((p: { campaign?: string }) => p.campaign)).toBe(true);
    for (const v of ['yes', 'no']) expect(ts.purchases.some((p: { bot?: string }) => p.bot === v)).toBe(true);
    expect(ts.purchases.some((p: { bot?: string }) => p.bot === undefined)).toBe(true);
    expect(ts.purchases.some((p: { coupon?: string }) => p.coupon === 'קופון אישי של הבוט')).toBe(true);
    expect(ts.leads.some((l: { firstAt?: string }) => l.firstAt)).toBe(true);
    expect(ph).toEqual(ts);
  });

  it('with the mailing tabs, and when one of them is missing or broken', () => {
    const { leads, purchases } = fixture(150);
    const { mailings, waves } = mailingFixture();
    const ts = (m: string | null, w: string | null) =>
      JSON.parse(pack(leadsFromRows(parseCsv(leads), parseCsv(purchases), new Date(at), m === null ? null : parseCsv(m), w === null ? null : parseCsv(w))));
    const full = ts(mailings, waves);
    expect(full.mailings.length).toBeGreaterThan(25);
    expect(full.mailingWaves.map((w: { kind: string }) => w.kind)).toEqual(['wave', 'others', 'total']);
    expect(viaPhp(leads, at, purchases, mailings, waves)).toEqual(full);
    expect(viaPhp(leads, at, purchases, undefined, waves)).toEqual(ts(null, waves));
    const broken = mailings.replace('תאריך רכישה', 'תאריך');
    expect(viaPhp(leads, at, purchases, broken, waves)).toEqual(ts(broken, waves));
    expect(ts(broken, waves).mailings).toBeUndefined();
  });

  it('without the optional columns, and without a purchases tab', () => {
    const { leads, purchases } = fixture(200, false);
    expect(viaPhp(leads, at, purchases)).toEqual(JSON.parse(pack(leadsFromRows(parseCsv(leads), parseCsv(purchases), new Date(at)))));
    expect(viaPhp(leads, at)).toEqual(JSON.parse(pack(leadsFromRows(parseCsv(leads), null, new Date(at)))));
  });

  it('fails the same way when a needed column is missing', () => {
    const { leads, purchases } = fixture(5);
    expect(viaPhp(leads.replace('סכום ששולם', 'סכום'), at)).toEqual({ error: 'חסרות עמודות בלשונית הלידים: סכום ששולם' });
    expect(viaPhp(leads, at, purchases.replace('קוד מזהה', 'מזהה'))).toEqual({ error: 'חסרות עמודות בלשונית הרכישות: קוד מזהה' });
  });
});
