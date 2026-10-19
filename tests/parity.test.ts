import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pack } from '../lib/leads/file';
import { leadsFromRows, OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from '../lib/leads/fromSheet';
import { parseCsv } from '../lib/sheet/parse';

/**
 * השרת מעבד את הטבלה ב-PHP (public/_leads.php), והבנייה בגיטהאב ב-TypeScript.
 * הבדיקה הזו מריצה את שניהם על אותה טבלה מדומה ודורשת תוצאה זהה.
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

/** טבלה מדומה עם כל המקרים הקשים: מרכאות, שורות בתוך תא, HTML, כפילויות, תאריכים שבורים, רווחים מיוחדים */
function fixture(n: number, extraHeader = true): string {
  const rnd = seeded(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const header = ['קוד מזהה', 'שם לקוח', ...REQUIRED_COLUMNS, 'הערות', ...(extraHeader ? ['עמודה עתידית', ...OPTIONAL_COLUMNS] : [])];
  const lines = [`﻿${header.map(q).join(',')}`];
  const two = (x: number) => String(x).padStart(2, '0');
  for (let i = 0; i < n; i++) {
    const day = 1 + Math.floor(rnd() * 28);
    const month = pick([3, 9, 10, 11]); // כולל מעבר שעון קיץ/חורף
    const date = rnd() < 0.02 ? pick(['', '31/02/2026', '2026-10-01', 'לא תאריך']) : `${two(day)}/${two(month)}/2026 ${two(Math.floor(rnd() * 24))}:${two(Math.floor(rnd() * 60))}:${two(Math.floor(rnd() * 60))}`;
    const phone = pick(['0501111111', '+972-50-111-1111', '0502222222', '', `05${Math.floor(rnd() * 1e8)}`, `05${Math.floor(rnd() * 1e8)}`]);
    const v: Record<string, string> = {
      'קוד מזהה': `ID${i}`,
      'שם לקוח': pick(['ישראל ישראלי', ' ', 'Test, "Name"']),
      'תאריך כניסה': date,
      טלפון: phone,
      מייל: pick(['', 'A@Example.com', 'b@example.com']),
      'מקור הגעה': pick(["אורגני - צ'אטבוט וואטסאפ", 'צאטבוט', '  ריווח מיוחד  ']),
      סטטוס: pick(['', 'עבר', 'לא עבר', 'ליד חדש']),
      'הסיר את עצמו?': rnd() < 0.05 ? pick(['24/09/2026 11:58', 'כן']) : '',
      "ענה לצ'אטבוט?": pick(['', 'כן']),
      'שלב בשאלון': pick(['', '0', '3', '10', '2.5', 'abc']),
      'סטטוס שאלון': pick(['', 'Converted', 'payment', 'finished', 'started', 'irrelevant']),
      'שם תהליך': pick(['תהליך ראשי', 'הרשמה לאתגר', '']),
      'ניקוד לקוח': pick(['', '12', '70', '-3']),
      מבחן: pick(['', 'One Step Assessment - 100K - MT5', 'Freedom Challenge - MT5 - 20k']),
      'מוצר שנקנה': pick(['', '-', ' - ', 'Lightning Pro', 'Lightning challenge 1 step<span> - </span>MT5, 100k', 'שורה\nשנייה']),
      'סכום ששולם': pick(['', '99', '99.99', '- 990', '€2,400', '.', '0']),
      הערות: pick(['', 'הערה "פנימית"', 'a,b']),
      'עמודה עתידית': 'x',
      'התחיל שיחה': pick(['', 'כן', 'לא', 'TRUE', 'false', '0']),
      'אופן שיחה': pick(['', 'שירות', 'מכירותי', 'גם וגם', 'אין שיחה']),
    };
    lines.push(header.map((h) => q(v[h] ?? '')).join(','));
    if (rnd() < 0.15) {
      // כפילות: אותו טלפון, אותה שנייה או כמה שניות אחרי, עם פחות או יותר נתונים
      const copy: Record<string, string> = { ...v, 'קוד מזהה': `ID${i}b`, הערות: rnd() < 0.5 ? '' : 'עוד', 'סטטוס שאלון': pick([v['סטטוס שאלון'], 'converted']) };
      lines.push(header.map((h) => q(copy[h] ?? '')).join(','));
    }
    if (rnd() < 0.03) lines.push(header.map(() => '').join(','));
  }
  return lines.join(rnd() < 0.5 ? '\r\n' : '\n');
}

function viaPhp(csv: string, at: string): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const file = join(dir, 'leads.csv');
  writeFileSync(file, csv);
  return JSON.parse(execFileSync('php', ['scripts/php-leads.php', file, at], { encoding: 'utf8', maxBuffer: 50e6 }));
}

describe.skipIf(!php)('PHP on the server gives exactly the same data as TypeScript', () => {
  const at = '2026-10-19T12:00:00.000Z';

  it('on a large messy sheet', () => {
    const csv = fixture(1500);
    const ts = JSON.parse(pack(leadsFromRows(parseCsv(csv), new Date(at))));
    const ph = viaPhp(csv, at);
    expect(ts.duplicatesRemoved).toBeGreaterThan(50);
    expect(ts.skippedRows).toBeGreaterThan(0);
    expect(ph).toEqual(ts);
  });

  it('without the optional columns', () => {
    const csv = fixture(200, false);
    expect(viaPhp(csv, at)).toEqual(JSON.parse(pack(leadsFromRows(parseCsv(csv), new Date(at)))));
  });

  it('fails the same way when a needed column is missing', () => {
    const csv = fixture(5).replace('סכום ששולם', 'סכום');
    expect(viaPhp(csv, at)).toEqual({ error: 'חסרות עמודות בלשונית הלידים: סכום ששולם' });
  });
});
