import { cleanText, parseAmount, parseSheetDate } from '../sheet/parse';
import type { Lead, LeadsFile } from './types';

/** עמודות שהדשבורד צריך. אם אחת מהן חסרה, הבנייה נכשלת בהודעה ברורה ולא מציגה מספרים שגויים. */
export const REQUIRED_COLUMNS = [
  'תאריך כניסה', 'טלפון', 'מייל', 'מקור הגעה', 'סטטוס', 'הסיר את עצמו?', "ענה לצ'אטבוט?",
  'שלב בשאלון', 'סטטוס שאלון', 'שם תהליך', 'ניקוד לקוח', 'מבחן', 'מוצר שנקנה', 'סכום ששולם',
] as const;

/**
 * כפילות: אותו משתמש (טלפון, ובלי טלפון מייל) בשתי שורות שהפרש תאריך הכניסה ביניהן עד כמה שניות.
 * מהזוג נשארת השורה עם יותר תאים מלאים (החלטת המנהל, #13). שורות של אותו משתמש בהפרש גדול יותר
 * הן רכישות או שדרוגים נוספים, ונשארות.
 */
export const DUPLICATE_WINDOW_SECONDS = 10;

export class SheetShapeError extends Error {}

interface Raw {
  index: number;
  at: Date;
  key: string | null;
  filled: number;
  cells: string[];
}

export function leadsFromRows(rows: string[][], generatedAt = new Date()): LeadsFile {
  const [header, ...body] = rows;
  if (!header) throw new SheetShapeError('הטבלה ריקה');
  const idx = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = REQUIRED_COLUMNS.filter((c) => !idx.has(c));
  if (missing.length) throw new SheetShapeError(`חסרות עמודות בלשונית הלידים: ${missing.join(', ')}`);
  const col = (r: string[], name: (typeof REQUIRED_COLUMNS)[number]) => (r[idx.get(name)!] ?? '').trim();

  const data = body.filter((r) => r.some((c) => c.trim() !== ''));
  const raws: Raw[] = [];
  let skipped = 0;
  data.forEach((cells, index) => {
    const at = parseSheetDate(col(cells, 'תאריך כניסה'));
    if (!at) {
      skipped++;
      return;
    }
    const phone = col(cells, 'טלפון').replace(/\D/g, '').slice(-9);
    const mail = col(cells, 'מייל').toLowerCase();
    raws.push({ index, at, key: phone || mail || null, filled: cells.filter((c) => c.trim() !== '').length, cells });
  });

  const dropped = findDuplicates(raws);
  const leads = raws
    .filter((r) => !dropped.has(r.index))
    .map((r) => toLead(r, col))
    .sort((a, b) => a.at.localeCompare(b.at));

  return {
    version: 1,
    origin: 'sheet',
    generatedAt: generatedAt.toISOString(),
    sheetRows: data.length,
    duplicatesRemoved: dropped.size,
    skippedRows: skipped,
    leads,
  };
}

/** מחזיר את האינדקסים של השורות המיותרות. */
export function findDuplicates(raws: Raw[]): Set<number> {
  const dropped = new Set<number>();
  const groups = new Map<string, Raw[]>();
  for (const r of raws) {
    if (!r.key) continue;
    const g = groups.get(r.key);
    if (g) g.push(r);
    else groups.set(r.key, [r]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.at.getTime() - b.at.getTime() || a.index - b.index);
    // אשכול: שורות שכל אחת מהן קרובה לקודמת. מכל אשכול נשארת אחת.
    let cluster: Raw[] = [g[0]];
    const flush = () => {
      if (cluster.length < 2) return;
      const keep = cluster.reduce((best, r) => (r.filled > best.filled ? r : best));
      for (const r of cluster) if (r !== keep) dropped.add(r.index);
    };
    for (let i = 1; i < g.length; i++) {
      const gap = (g[i].at.getTime() - g[i - 1].at.getTime()) / 1000;
      if (gap <= DUPLICATE_WINDOW_SECONDS) {
        cluster.push(g[i]);
      } else {
        flush();
        cluster = [g[i]];
      }
    }
    flush();
  }
  return dropped;
}

function toLead(r: Raw, col: (r: string[], name: (typeof REQUIRED_COLUMNS)[number]) => string): Lead {
  const c = (name: (typeof REQUIRED_COLUMNS)[number]) => col(r.cells, name);
  const num = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const removedRaw = c('הסיר את עצמו?');
  const removedAt = removedRaw ? (parseSheetDate(removedRaw)?.toISOString() ?? r.at.toISOString()) : null;
  return {
    at: r.at.toISOString(),
    source: cleanText(c('מקור הגעה')),
    process: cleanText(c('שם תהליך')),
    status: cleanText(c('סטטוס')),
    qStatus: cleanText(c('סטטוס שאלון'))?.toLowerCase() ?? null,
    answered: c("ענה לצ'אטבוט?") === 'כן',
    step: num(c('שלב בשאלון')),
    score: num(c('ניקוד לקוח')),
    test: cleanText(c('מבחן')),
    product: cleanText(c('מוצר שנקנה')),
    amount: parseAmount(c('סכום ששולם')),
    removedAt,
  };
}
