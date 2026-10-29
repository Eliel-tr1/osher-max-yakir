import { cleanText, parseAmount, parseSheetDate, israelDayStart } from '../sheet/parse';
import type { Lead, LeadsFile, Purchase } from './types';

/** עמודות שהדשבורד צריך בלשונית הלידים. אם אחת מהן חסרה, הבנייה נכשלת בהודעה ברורה ולא מציגה מספרים שגויים. */
export const REQUIRED_COLUMNS = [
  'תאריך כניסה', 'קוד מזהה', 'מקור הגעה', 'סטטוס', 'הסיר את עצמו?', "ענה לצ'אטבוט?",
  'שלב בשאלון', 'סטטוס שאלון', 'שם תהליך', 'ניקוד לקוח', 'מבחן', 'מוצר שנקנה', 'סכום ששולם',
] as const;

/**
 * עמודות שהדשבורד משתמש בהן אם הן קיימות. בלעדיהן השדה פשוט ריק.
 * הן ממולאות על ידי סוכן AI. עמודות חדשות אחרות בטבלה לא משפיעות על הדשבורד: הוא קורא לפי שם, לא לפי מיקום.
 */
export const OPTIONAL_COLUMNS = ['התחיל שיחה', 'אופן שיחה'] as const;

/** עמודות שהדשבורד צריך בלשונית הרכישות. */
export const PURCHASE_COLUMNS = ['תאריך', 'קוד מזהה', 'מקור הגעה', 'מוצר שנקנה', 'סכום ששולם'] as const;
/** עמודות של רכישות שעוד לא קיימות בטבלה. utm_campaign יתווסף על ידי n8n (#14). */
export const OPTIONAL_PURCHASE_COLUMNS = ['utm_campaign'] as const;

/** שורות מלפני התאריך הזה הן שורות בדיקה ולא נכנסות לדשבורד (החלטת המנהל, 29/10/2026). */
export const START_DAY = '2026-09-01';

/** רכישה שבשם המוצר שלה כתוב שהיא בדיקה (למשל הזמנות הבדיקה של n8n) לא נכנסת (החלטת המנהל, 29/10/2026). */
export const TEST_PRODUCT = /בדיק|\btest\b/i;

/**
 * אותה רכישה שנכתבה פעמיים: אותו קוד מזהה ואותו סכום, בהפרש של עד שתי דקות. נשארת הראשונה.
 * רכישות באותו סכום בהפרש גדול יותר הן רכישות נוספות, ונשארות.
 */
export const PURCHASE_DUPLICATE_SECONDS = 120;

/** "מקור הגעה" של הבוט עצמו (כניסה אורגנית לוואטסאפ), בשני האיותים שבטבלה. */
export const BOT_SOURCE = 'בוט וואטסאפ';
/** "מקור הגעה" שהוא שם של מבחן או מוצר: הלקוח הגיע מהאתר, דרך מבחן או רכישה, בלי utm. */
export const SITE_SOURCE = 'מהאתר (מבחן או רכישה)';

/** עמודה של כן/לא שסוכן ממלא: ריק = עוד לא נבדק; "לא", "no", "false", "0" = לא; כל ערך אחר = כן. */
export function yesNo(v: string): 'yes' | 'no' | null {
  const t = v.trim();
  if (t === '') return null;
  return /^(לא|no|false|0)$/i.test(t) ? 'no' : 'yes';
}

/** קבוצת המקור, לסינון ולפילוח. productNames: כל שמות המוצרים והמבחנים שבטבלה. */
export function sourceGroupOf(source: string | null, productNames: Set<string>): string | null {
  if (source === null) return null;
  if (/^(אורגני|צאטבוט|צ'אטבוט)/.test(source)) return BOT_SOURCE;
  if (productNames.has(source)) return SITE_SOURCE;
  return source;
}

type LeadColumn = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];
type PurchaseColumn = (typeof PURCHASE_COLUMNS)[number] | (typeof OPTIONAL_PURCHASE_COLUMNS)[number];

export class SheetShapeError extends Error {}

interface Raw {
  index: number;
  at: Date;
  ns: string;
  filled: number;
  cells: string[];
}

function indexer(rows: string[][], required: readonly string[], tabName: string) {
  const [header, ...body] = rows;
  if (!header) throw new SheetShapeError(`לשונית ${tabName} ריקה`);
  const idx = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = required.filter((c) => !idx.has(c));
  if (missing.length) throw new SheetShapeError(`חסרות עמודות בלשונית ${tabName}: ${missing.join(', ')}`);
  const col = (r: string[], name: string) => (idx.has(name) ? (r[idx.get(name)!] ?? '') : '').trim();
  const data = body.filter((r) => r.some((c) => c.trim() !== ''));
  return { col, data };
}

/**
 * מהשורות של שתי הלשוניות לקובץ הנתונים. purchaseRows = null כשאין לשונית רכישות: אז הרכישות נלקחות
 * משורות הלידים בלבד (הרכישה האחרונה של כל אדם).
 */
export function leadsFromRows(leadRows: string[][], purchaseRows: string[][] | null = null, generatedAt = new Date()): LeadsFile {
  const L = indexer(leadRows, REQUIRED_COLUMNS, 'הלידים');
  const lcol = (r: string[], name: LeadColumn) => L.col(r, name);
  const start = israelDayStart(START_DAY).getTime();

  const raws: Raw[] = [];
  L.data.forEach((cells, index) => {
    const at = parseSheetDate(lcol(cells, 'תאריך כניסה'));
    if (!at || at.getTime() < start) return;
    raws.push({ index, at, ns: lcol(cells, 'קוד מזהה'), filled: cells.filter((c) => c.trim() !== '').length, cells });
  });

  const kept = dedupeByNs(raws).sort((a, b) => a.at.getTime() - b.at.getTime() || a.index - b.index);

  // שמות של מוצרים ומבחנים, כדי לזהות "מקור הגעה" שהוא בעצם שם מוצר
  const productNames = new Set<string>();
  for (const r of kept) {
    const p = cleanText(lcol(r.cells, 'מוצר שנקנה'));
    const t = cleanText(lcol(r.cells, 'מבחן'));
    if (p) productNames.add(p);
    if (t) productNames.add(t);
  }
  const P = purchaseRows ? indexer(purchaseRows, PURCHASE_COLUMNS, 'הרכישות') : null;
  const pcol = (r: string[], name: PurchaseColumn) => (P ? P.col(r, name) : '');
  if (P) for (const r of P.data) {
    const p = cleanText(pcol(r, 'מוצר שנקנה'));
    if (p) productNames.add(p);
  }

  const leads = kept.map((r) => toLead(r, lcol, productNames));
  const leadOfNs = new Map<string, number>();
  kept.forEach((r, i) => {
    if (r.ns !== '') leadOfNs.set(r.ns, i);
  });

  const purchases = P ? purchasesFromRows(P.data, pcol, leads, leadOfNs, productNames, start) : [];
  // קונים שמסומנים בלשונית הלידים ואין להם אף שורה בלשונית הרכישות: הרכישה האחרונה שלהם נלקחת משם
  const withRows = new Set(purchases.map((p) => p.lead).filter((l): l is number => l !== null));
  leads.forEach((l, i) => {
    if ((l.qStatus === 'converted' || l.qStatus === 'payment') && !withRows.has(i)) {
      purchases.push({ at: l.at, lead: i, product: l.product ?? l.test, amount: l.amount, source: null, sourceGroup: null, campaign: null, fromLead: true });
    }
  });
  purchases.sort((a, b) => a.at.localeCompare(b.at) || (a.lead ?? -1) - (b.lead ?? -1));

  return {
    version: 2,
    origin: 'sheet',
    generatedAt: generatedAt.toISOString(),
    sheetRows: L.data.length,
    purchaseRows: P ? P.data.length : 0,
    leads,
    purchases,
  };
}

/** אדם אחד = קוד מזהה אחד. מכמה שורות של אותו קוד נשארת השורה עם יותר תאים מלאים, ובשוויון הראשונה (#13, #21). */
export function dedupeByNs(raws: Raw[]): Raw[] {
  const best = new Map<string, Raw>();
  const out: Raw[] = [];
  for (const r of raws) {
    if (r.ns === '') {
      out.push(r);
      continue;
    }
    const b = best.get(r.ns);
    if (!b || r.filled > b.filled) best.set(r.ns, r);
  }
  return [...out, ...best.values()];
}

function purchasesFromRows(
  data: string[][], col: (r: string[], name: PurchaseColumn) => string, leads: Lead[], leadOfNs: Map<string, number>,
  productNames: Set<string>, start: number,
): Purchase[] {
  const rows: { at: Date; ns: string; p: Purchase }[] = [];
  data.forEach((cells) => {
    const at = parseSheetDate(col(cells, 'תאריך'));
    if (!at || at.getTime() < start) return;
    const amount = parseAmount(col(cells, 'סכום ששולם'));
    const ns = col(cells, 'קוד מזהה');
    const lead = ns !== '' ? (leadOfNs.get(ns) ?? null) : null;
    let product = cleanText(col(cells, 'מוצר שנקנה'));
    if (product && TEST_PRODUCT.test(product)) return;
    // שם מוצר חסר (עד 22/10 הוא לא נרשם): נלקח משורת הליד רק כשזו אותה רכישה, כלומר אותו סכום
    if (product === null && lead !== null) {
      const l = leads[lead];
      if (l.amount !== null && l.amount === amount) product = l.product ?? l.test;
    }
    const source = cleanText(col(cells, 'מקור הגעה'));
    rows.push({
      at, ns,
      p: {
        at: at.toISOString(), lead, product, amount, source, sourceGroup: sourceGroupOf(source, productNames),
        campaign: cleanText(col(cells, 'utm_campaign')), fromLead: false,
      },
    });
  });
  // כפילויות: אותו קוד מזהה ואותו סכום בתוך שתי דקות
  const byNs = new Map<string, { at: Date; ns: string; p: Purchase }[]>();
  rows.forEach((r) => {
    if (r.ns === '') return;
    const g = byNs.get(r.ns);
    if (g) g.push(r);
    else byNs.set(r.ns, [r]);
  });
  const dropped = new Set<object>();
  for (const g of byNs.values()) {
    g.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (let i = 1; i < g.length; i++) {
      const prev = g[i - 1];
      if (g[i].p.amount === prev.p.amount && (g[i].at.getTime() - prev.at.getTime()) / 1000 <= PURCHASE_DUPLICATE_SECONDS) dropped.add(g[i]);
    }
  }
  return rows.filter((r) => !dropped.has(r)).map((r) => r.p);
}

function toLead(r: Raw, col: (r: string[], name: LeadColumn) => string, productNames: Set<string>): Lead {
  const c = (name: LeadColumn) => col(r.cells, name);
  const num = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const removedRaw = c('הסיר את עצמו?');
  const removedAt = removedRaw ? (parseSheetDate(removedRaw)?.toISOString() ?? r.at.toISOString()) : null;
  const source = cleanText(c('מקור הגעה'));
  return {
    at: r.at.toISOString(),
    source,
    sourceGroup: sourceGroupOf(source, productNames),
    process: cleanText(c('שם תהליך')),
    status: cleanText(c('סטטוס')),
    qStatus: cleanText(c('סטטוס שאלון'))?.toLowerCase() ?? null,
    answered: c("ענה לצ'אטבוט?") === 'כן',
    aiConversation: yesNo(c('התחיל שיחה')),
    step: num(c('שלב בשאלון')),
    score: num(c('ניקוד לקוח')),
    test: cleanText(c('מבחן')),
    product: cleanText(c('מוצר שנקנה')),
    amount: parseAmount(c('סכום ששולם')),
    removedAt,
    mode: cleanText(c('אופן שיחה')),
  };
}
