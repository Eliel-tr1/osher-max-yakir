/** פענוח של מה שמגיע מגוגל שיטס: CSV, תאריכים בשעון ישראל, וסכומים. */

/** CSV לפי RFC 4180: מרכאות, פסיקים ושורות חדשות בתוך תא, ומרכאות כפולות. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "30/09/2026 10:09:41", "30/09/2026 10:09" או "30/09/2026" -> Date בשעון ישראל. לא תאריך -> null. */
export function parseSheetDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(Number(y), month, 0)).getUTCDate()) return null;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${s.padStart(2, '0')}`;
  // ישראל: +03:00 בקיץ, +02:00 בחורף. Intl יודע מה נכון לכל תאריך.
  return new Date(`${iso}${israelOffset(iso)}`);
}

function israelOffset(isoLocal: string): string {
  const guess = new Date(`${isoLocal}Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' })
    .formatToParts(guess)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+02:00';
}

/** "- 990", "₪2,400", "990.5" -> מספר. ריק או לא מספר -> null. */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** טקסט חופשי מהשיטס: בלי תגיות HTML, רווחים מאוחדים. ריק או "-" -> null. */
export function cleanText(value: string | undefined): string | null {
  if (!value) return null;
  const t = value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return t === '' || t === '-' ? null : t;
}

/** "2026-10-19" -> חצות של אותו יום בשעון ישראל. */
export function israelDayStart(day: string): Date {
  const iso = `${day}T00:00:00`;
  return new Date(`${iso}${israelOffset(iso)}`);
}
