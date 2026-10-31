import { cleanText, parseAmount, parseSheetDate, israelDayStart } from '../sheet/parse';
import type { Lead, LeadsFile, MailingPurchase, MailingWave, Purchase } from './types';

/** עמודות שהדשבורד צריך בלשונית הלידים. אם אחת מהן חסרה, הבנייה נכשלת בהודעה ברורה ולא מציגה מספרים שגויים. */
export const REQUIRED_COLUMNS = [
  'תאריך כניסה', 'קוד מזהה', 'מקור הגעה', 'סטטוס', 'הסיר את עצמו?', "ענה לצ'אטבוט?",
  'שלב בשאלון', 'סטטוס שאלון', 'שם תהליך', 'ניקוד לקוח', 'מבחן', 'מוצר שנקנה', 'סכום ששולם',
] as const;

/**
 * עמודות שהדשבורד משתמש בהן אם הן קיימות. בלעדיהן השדה פשוט ריק.
 * הן ממולאות על ידי סוכן AI. עמודות חדשות אחרות בטבלה לא משפיעות על הדשבורד: הוא קורא לפי שם, לא לפי מיקום.
 */
export const OPTIONAL_COLUMNS = ['התחיל שיחה', 'אופן שיחה', 'utm_campaign', 'הודעות לקוח', 'קופון הבוט', 'תאריך קופון'] as const;

/** עמודות שהדשבורד צריך בלשונית הרכישות. */
export const PURCHASE_COLUMNS = ['תאריך', 'קוד מזהה', 'מקור הגעה', 'מוצר שנקנה', 'סכום ששולם'] as const;
/**
 * עמודות של רכישות שהדשבורד קורא אם הן קיימות. בלעדיהן הרענון לא נכשל.
 * "של הבוט": ההכרעה אם הרכישה של הבוט, נכתבת רק על ידי הסוכן של המנהל (החלטת המנהל, 29/10/2026).
 */
export const OPTIONAL_PURCHASE_COLUMNS = ['utm_campaign', 'של הבוט', 'סיבה', 'קופון מהרכישה'] as const;

/** לשונית "דיוורים": שורה לכל רכישה בקמפיין. כשחסרה עמודה, הלשונית נחשבת חסרה והסקשן מוסתר. */
export const MAILING_COLUMNS = ['קמפיין', 'גל', 'תאריך שליחה', 'תאריך רכישה', 'קוד מזהה', 'מוצר', 'סכום', 'דרך קישור הקמפיין', 'קופון', 'של הבוט', 'סיבה'] as const;
/** לשונית "דיוורים - סיכום": שורה לכל גל, שורה למי שלא היה נמען ושורת סה"כ */
export const MAILING_WAVE_COLUMNS = [
  'קמפיין', 'גל', 'תאריך שליחה', 'נשלחו', 'לא נמסרו (WhatsApp)', 'נמסרו', 'קונים', 'רכישות', 'סכום',
  'רכישות דרך הקישור', 'סכום דרך הקישור', 'רכישות עם SPOOKY', 'של הבוט = כן', 'הערה',
] as const;

/** קבוצת הקופונים האישיים שהבוט מפיק. הקודים עצמם לא נשמרים ולא מוצגים. */
export const BOT_COUPON_GROUP = 'קופון אישי של הבוט';
const BOT_COUPON = /^PTB-[0-9A-F]{10}$/;

/**
 * "קופון מהרכישה" לקוד אחד: לפעמים JSON עם השדה code ולפעמים טקסט. אותיות גדולות.
 * ריק, "-" ו-empty = בלי קופון (null). קופון אישי של הבוט = BOT_COUPON_GROUP.
 */
export function couponCode(v: string): string | null {
  let t = v.trim();
  if (t.startsWith('{')) {
    try {
      const j: unknown = JSON.parse(t);
      const code = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>).code : undefined;
      t = typeof code === 'string' ? code : '';
    } catch {
      // לא JSON תקין: נשאר כטקסט
    }
  }
  t = t.trim().toUpperCase();
  if (t === '' || t === '-' || t === 'EMPTY') return null;
  return BOT_COUPON.test(t) ? BOT_COUPON_GROUP : t;
}

/** הערך של "של הבוט" שאומר שהרכישה של הבוט. רק הוא, בדיוק, אחרי הסרת רווחים בקצוות. */
export const BOT_YES = 'כן';

/** "של הבוט": "כן" בדיוק = 'yes'; ריק = null (עוד לא הוכרע); כל ערך אחר = 'no'. הערך כבר בלי רווחים בקצוות. */
export function botFlag(v: string): 'yes' | 'no' | null {
  if (v === '') return null;
  return v === BOT_YES ? 'yes' : 'no';
}

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
type MailingColumn = (typeof MAILING_COLUMNS)[number];
type WaveColumn = (typeof MAILING_WAVE_COLUMNS)[number];

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
export function leadsFromRows(
  leadRows: string[][], purchaseRows: string[][] | null = null, generatedAt = new Date(),
  mailingRows: string[][] | null = null, waveRows: string[][] | null = null,
): LeadsFile {
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
  // תאריך הכניסה המוקדם ביותר של כל אדם
  const firstOfNs = new Map<string, Date>();
  for (const r of raws) {
    if (r.ns === '') continue;
    const f = firstOfNs.get(r.ns);
    if (!f || r.at.getTime() < f.getTime()) firstOfNs.set(r.ns, r.at);
  }

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

  const leads = kept.map((r) => toLead(r, lcol, productNames, firstOfNs.get(r.ns) ?? null));
  const leadOfNs = new Map<string, number>();
  kept.forEach((r, i) => {
    if (r.ns !== '') leadOfNs.set(r.ns, i);
  });

  // מספר סידורי לכל קונה: קוד מזהה שונה = מספר שונה; בלי קוד מזהה = קונה בפני עצמו
  const buyerOfNs = new Map<string, number>();
  let nextBuyer = 0;
  const buyerId = (ns: string) => {
    if (ns === '') return nextBuyer++;
    let id = buyerOfNs.get(ns);
    if (id === undefined) {
      id = nextBuyer++;
      buyerOfNs.set(ns, id);
    }
    return id;
  };
  const purchases = P ? purchasesFromRows(P.data, pcol, leads, leadOfNs, productNames, start, buyerId) : [];
  // קונים שמסומנים בלשונית הלידים ואין להם אף שורה בלשונית הרכישות: הרכישה האחרונה שלהם נלקחת משם
  const withRows = new Set(purchases.map((p) => p.lead).filter((l): l is number => l !== null));
  leads.forEach((l, i) => {
    if ((l.qStatus === 'converted' || l.qStatus === 'payment') && !withRows.has(i)) {
      // רכישה משורת ליד: אין לה תא "של הבוט", ולכן היא עוד לא הוכרעה
      purchases.push({
        at: l.at, lead: i, product: l.product ?? l.test, amount: l.amount, source: null, sourceGroup: null, campaign: null, fromLead: true, bot: null,
        reason: null, coupon: null, buyer: buyerId(kept[i].ns),
      });
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
    mailings: mailingRows ? mailingsFromRows(mailingRows) : null,
    mailingWaves: waveRows ? wavesFromRows(waveRows) : null,
  };
}

/** כמו indexer, אבל לשונית שחסרה בה עמודה מחזירה null במקום לזרוק: הסקשן מוסתר והדשבורד ממשיך */
function optionalIndexer(rows: string[][], required: readonly string[]) {
  try {
    return indexer(rows, required, '');
  } catch {
    return null;
  }
}

/** לשונית "דיוורים" */
export function mailingsFromRows(rows: string[][]): MailingPurchase[] | null {
  const M = optionalIndexer(rows, MAILING_COLUMNS);
  if (!M) return null;
  const c = (r: string[], name: MailingColumn) => M.col(r, name);
  const ids = new Map<string, number>();
  let next = 0;
  const out: MailingPurchase[] = [];
  for (const r of M.data) {
    const at = parseSheetDate(c(r, 'תאריך רכישה'));
    if (!at) continue;
    const ns = c(r, 'קוד מזהה');
    let buyer: number;
    if (ns === '') buyer = next++;
    else {
      const id = ids.get(ns);
      if (id === undefined) {
        buyer = next++;
        ids.set(ns, buyer);
      } else buyer = id;
    }
    out.push({
      campaign: c(r, 'קמפיין'), wave: c(r, 'גל'), sentAt: parseSheetDate(c(r, 'תאריך שליחה'))?.toISOString() ?? null, at: at.toISOString(), buyer,
      product: cleanText(c(r, 'מוצר')), amount: parseAmount(c(r, 'סכום')), viaLink: c(r, 'דרך קישור הקמפיין') === BOT_YES,
      coupon: couponCode(c(r, 'קופון')), bot: botFlag(c(r, 'של הבוט')), reason: cleanText(c(r, 'סיבה')),
    });
  }
  return out;
}

/** לשונית "דיוורים - סיכום". שורת סה"כ מזוהה לפי "סה"כ" בעמודה "גל"; שורה בלי "נשלחו" היא של מי שלא היה נמען. */
export function wavesFromRows(rows: string[][]): MailingWave[] | null {
  const W = optionalIndexer(rows, MAILING_WAVE_COLUMNS);
  if (!W) return null;
  const c = (r: string[], name: WaveColumn) => W.col(r, name);
  const n = (r: string[], name: WaveColumn) => parseAmount(c(r, name));
  return W.data.map((r) => {
    const wave = c(r, 'גל');
    const sent = n(r, 'נשלחו');
    return {
      campaign: c(r, 'קמפיין'), wave, kind: wave.includes('סה"כ') ? 'total' : sent !== null ? 'wave' : 'others', sentDay: cleanText(c(r, 'תאריך שליחה')),
      sent, undelivered: n(r, 'לא נמסרו (WhatsApp)'), delivered: n(r, 'נמסרו'), buyers: n(r, 'קונים'), purchases: n(r, 'רכישות'), amount: n(r, 'סכום'),
      viaLinkPurchases: n(r, 'רכישות דרך הקישור'), viaLinkAmount: n(r, 'סכום דרך הקישור'), spooky: n(r, 'רכישות עם SPOOKY'), bot: n(r, 'של הבוט = כן'),
      note: cleanText(c(r, 'הערה')),
    };
  });
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
  productNames: Set<string>, start: number, buyerId: (ns: string) => number,
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
        campaign: cleanText(col(cells, 'utm_campaign')), fromLead: false, bot: botFlag(col(cells, 'של הבוט')),
        reason: cleanText(col(cells, 'סיבה')), coupon: couponCode(col(cells, 'קופון מהרכישה')), buyer: buyerId(ns),
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

function toLead(r: Raw, col: (r: string[], name: LeadColumn) => string, productNames: Set<string>, first: Date | null): Lead {
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
    campaign: cleanText(c('utm_campaign')),
    messages: num(c('הודעות לקוח')),
    botCoupon: c('קופון הבוט') !== '',
    couponAt: parseSheetDate(c('תאריך קופון'))?.toISOString() ?? null,
    firstAt: first && first.getTime() < r.at.getTime() ? first.toISOString() : null,
  };
}
