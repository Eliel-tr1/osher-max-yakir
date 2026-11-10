import { cleanText, parseAmount, parseSheetDate, israelDayStart } from '../sheet/parse';
import type { AnalysisRow, FeedbackRow, InquiryRow, Insights, StallRow, Lead, LeadsFile, MailingPurchase, MailingWave, Part, Purchase, QuestionRow } from './types';

/** עמודות שהדשבורד צריך בלשונית הלידים. אם אחת מהן חסרה, הבנייה נכשלת בהודעה ברורה ולא מציגה מספרים שגויים. */
export const REQUIRED_COLUMNS = [
  'תאריך כניסה', 'קוד מזהה', 'מקור הגעה', 'סטטוס', 'הסיר את עצמו?', "ענה לצ'אטבוט?",
  'שלב בשאלון', 'סטטוס שאלון', 'שם תהליך', 'ניקוד לקוח', 'מבחן', 'מוצר שנקנה', 'סכום ששולם',
] as const;

/**
 * עמודות שהדשבורד משתמש בהן אם הן קיימות. בלעדיהן השדה פשוט ריק.
 * הן ממולאות על ידי סוכן AI. עמודות חדשות אחרות בטבלה לא משפיעות על הדשבורד: הוא קורא לפי שם, לא לפי מיקום.
 */
export const OPTIONAL_COLUMNS = ['התחיל שיחה', 'אופן שיחה', 'utm_campaign', 'הודעות לקוח', 'קופון הבוט', 'תאריך קופון', 'טלפון'] as const;

/** עמודות שהדשבורד צריך בלשונית הרכישות. */
export const PURCHASE_COLUMNS = ['תאריך', 'קוד מזהה', 'מקור הגעה', 'מוצר שנקנה', 'סכום ששולם'] as const;
/**
 * עמודות של רכישות שהדשבורד קורא אם הן קיימות. בלעדיהן הרענון לא נכשל.
 * "של הבוט": ההכרעה אם הרכישה של הבוט, נכתבת רק על ידי הסוכן של המנהל (החלטת המנהל, 29/10/2026).
 */
export const OPTIONAL_PURCHASE_COLUMNS = ['utm_campaign', 'של הבוט', 'סיבה', 'קופון מהרכישה', 'טלפון'] as const;

/**
 * טלפון, רק כדי לזהות את אותו אדם בכמה קודים מזהים (הנחיית המנהל, 1/11/2026). לא נשמר בשום קובץ:
 * ספרות בלבד, בלי 972 ובלי אפסים בהתחלה, 9 הספרות האחרונות. פחות מ-7 ספרות = אין טלפון.
 */
export function phoneKey(v: string): string | null {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('972')) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return d.length >= 7 ? d.slice(-9) : null;
}

/** קבוצות של קודים מזהים עם אותו טלפון */
class Groups {
  private parent = new Map<string, string>();

  find(x: string): string {
    let r = x;
    while (this.parent.has(r) && this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

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

/**
 * "תובנות שיחה" (הנחיית המנהל 3/11/2026): ארבע לשוניות שהסריקה של המנהל כותבת. עמודות חובה לכל לשונית; כשאחת חסרה,
 * החלק הזה null והכרטיס מציג "אין עדיין נתונים". שאר העמודות נקראות אם הן קיימות.
 */
export const ANALYSIS_COLUMNS = ['קוד מזהה', 'תאריך כניסה', 'מסלול', 'קנה', 'שלב אחרון', 'סיבת נטישה'] as const;
export const ANALYSIS_OPTIONAL = ['פירוט קצר', 'פנה לנציג', 'קטגוריית פנייה', 'שאלות ללא מענה', 'קטגוריית משוב', 'הודעות לקוח', 'נסרק ב:', 'סיבת הסרה', 'מקור הסיבה'] as const;
export const QUESTION_COLUMNS = ['שאלה', 'מופעים'] as const;
export const QUESTION_OPTIONAL = ['קטגוריה', 'נשאל לאחרונה', 'דוגמאות (קוד מזהה)', 'סטטוס', 'תשובת יקיר'] as const;
export const INQUIRY_COLUMNS = ['תאריך פניה', 'מזהה לקוח', 'קטגוריה'] as const;
export const INQUIRY_OPTIONAL = ['שם לקוח', 'תוכן הפניה'] as const;
export const FEEDBACK_COLUMNS = ['תאריך', 'קוד מזהה', 'קטגוריה'] as const;
export const FEEDBACK_OPTIONAL = ['מבחן', 'שם לקוח', 'הערות'] as const;
/** "נקודות עצירה" (10/11/2026, #38): העמודות שחייבות להיות, ואלה שנקראות כשהן קיימות */
export const STALL_COLUMNS = ['קוד מזהה', 'תאריך כניסה', 'נקודת עצירה'] as const;
export const STALL_OPTIONAL = ['שם תהליך', 'פירוט', 'הודעות לקוח', 'פעילות אחרונה', 'נסרק ב:'] as const;
/** פניות ומשובים מלפני היום הזה לא נכנסים: הסריקה מתחילה בו (הנחיית המנהל 3/11/2026) */
export const INSIGHTS_START_DAY = '2026-10-02';
/** טקסט חופשי ברשימות (פירוט, תוכן פנייה, הערות): עד כמה תווים נשמרים */
export const TEXT_MAX = 600;

/** טקסט חופשי לרשימה: נקי, ועד TEXT_MAX תווים (לפי תווים ולא בתים, כמו mb_substr ב-PHP) */
export function clip(v: string): string {
  const t = cleanText(v);
  if (t === null) return '';
  const chars = Array.from(t);
  return chars.length > TEXT_MAX ? `${chars.slice(0, TEXT_MAX).join('')}…` : t;
}

/** "כן" -> yes, "לא" -> no, אחר -> null (עמודות כן/לא של הסריקה) */
export function yesNoExact(v: string): 'yes' | 'no' | null {
  const t = v.trim();
  return t === 'כן' ? 'yes' : t === 'לא' ? 'no' : null;
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
 * הקודים המזהים (user_ns) של כל ליד, רכישה ורכישת דיוור, לפי אותו סדר כמו בקובץ הנתונים.
 * לא נכנסים לקובץ הציבורי: נשמרים בשרת מחוץ לאתר, ומוגשים רק אחרי כניסה (#6, הנחיית המנהל 1/11/2026).
 * ריק = אין קוד מזהה.
 */
export interface PrivateIds {
  generatedAt: string;
  leads: string[];
  purchases: string[];
  mailings: string[];
  /**
   * תובנות שיחה, לכל שורה באותו סדר כמו בקובץ: קוד מזהה, שם, וטקסט חופשי (פירוט קצר / תוכן הפנייה / הערות).
   * נשמרים רק כאן, ומוצגים רק ברשימות אחרי כניסה (הנחיית המנהל 3/11/2026). null = הלשונית חסרה.
   */
  analysis: PrivateRows | null;
  inquiries: PrivateRows | null;
  feedback: PrivateRows | null;
  /** "נקודות עצירה": קוד מזהה ושם (בלי טקסט) */
  stalls: PrivateRows | null;
  /** "דוגמאות (קוד מזהה)" לכל שאלה */
  questions: string[][] | null;
}

export interface PrivateRows {
  ns: string[];
  names: string[];
  texts: string[];
}

/** הלשוניות של תובנות השיחה, כשורות מה-CSV. חסרה = null */
export interface InsightRows {
  analysis?: string[][] | null;
  questions?: string[][] | null;
  inquiries?: string[][] | null;
  feedback?: string[][] | null;
  stalls?: string[][] | null;
}

/**
 * מהשורות של שתי הלשוניות לקובץ הנתונים. purchaseRows = null כשאין לשונית רכישות: אז הרכישות נלקחות
 * משורות הלידים בלבד (הרכישה האחרונה של כל אדם).
 */
export function leadsFromRows(
  leadRows: string[][], purchaseRows: string[][] | null = null, generatedAt = new Date(),
  mailingRows: string[][] | null = null, waveRows: string[][] | null = null, extra: InsightRows = {},
): LeadsFile {
  return buildData(leadRows, purchaseRows, generatedAt, mailingRows, waveRows, extra).file;
}

/** כמו leadsFromRows, וגם הקודים המזהים שנשמרים בנפרד */
export function buildData(
  leadRows: string[][], purchaseRows: string[][] | null = null, generatedAt = new Date(),
  mailingRows: string[][] | null = null, waveRows: string[][] | null = null, extra: InsightRows = {},
): { file: LeadsFile; ids: PrivateIds } {
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
  // אדם = קוד מזהה, וקודים מזהים עם אותו טלפון הם אותו אדם
  const groups = new Groups();
  for (const r of L.data) {
    const ns = lcol(r, 'קוד מזהה');
    const ph = phoneKey(lcol(r, 'טלפון'));
    if (ns !== '' && ph) groups.union(`n:${ns}`, `p:${ph}`);
  }
  if (P) for (const r of P.data) {
    const ns = pcol(r, 'קוד מזהה');
    const ph = phoneKey(pcol(r, 'טלפון'));
    if (ns !== '' && ph) groups.union(`n:${ns}`, `p:${ph}`);
  }
  const personOfRoot = new Map<string, number>();
  let nextPerson = 0;
  const personId = (ns: string, phone: string | null) => {
    const node = ns !== '' ? `n:${ns}` : phone ? `p:${phone}` : null;
    if (node === null) return nextPerson++;
    const root = groups.find(node);
    let id = personOfRoot.get(root);
    if (id === undefined) {
      id = nextPerson++;
      personOfRoot.set(root, id);
    }
    return id;
  };
  kept.forEach((r, i) => {
    leads[i].person = personId(r.ns, phoneKey(lcol(r.cells, 'טלפון')));
  });

  const fromTab = P ? purchasesFromRows(P.data, pcol, leads, leadOfNs, productNames, start, buyerId) : { rows: [], dupes: [] };
  const rows = fromTab.rows;
  // קונים שמסומנים בלשונית הלידים ואין להם אף שורה בלשונית הרכישות: הרכישה האחרונה שלהם נלקחת משם
  const withRows = new Set(rows.map((r) => r.p.lead).filter((l): l is number => l !== null));
  leads.forEach((l, i) => {
    if ((l.qStatus === 'converted' || l.qStatus === 'payment') && !withRows.has(i) && !(l.product && TEST_PRODUCT.test(l.product))) {
      // רכישה משורת ליד: אין לה תא "של הבוט", ולכן היא עוד לא הוכרעה
      rows.push({
        ns: kept[i].ns,
        phone: null,
        p: {
          at: l.at, lead: i, product: l.product ?? l.test, amount: l.amount, source: null, sourceGroup: null, campaign: null, fromLead: true, bot: null,
          reason: null, coupon: null, buyer: buyerId(kept[i].ns), person: 0,
        },
      });
    }
  });
  rows.sort((a, b) => a.p.at.localeCompare(b.p.at) || (a.p.lead ?? -1) - (b.p.lead ?? -1));
  for (const r of rows) r.p.person = personId(r.ns, r.phone);
  const mailings = mailingRows ? mailingsWithIds(mailingRows) : null;
  const at = generatedAt.toISOString();

  // שם לכל קוד מזהה מלשונית הלידים, לרשימות של תובנות השיחה (רק בקובץ הפרטי)
  const nameOfNs = new Map<string, string>();
  for (const r of L.data) {
    const ns = L.col(r, 'קוד מזהה');
    const name = cleanText(L.col(r, 'שם לקוח'));
    if (ns !== '' && name && !nameOfNs.has(ns)) nameOfNs.set(ns, name);
  }
  const insights = insightsFromRows(extra, at, leadOfNs, nameOfNs);

  return {
    file: {
      version: 2,
      origin: 'sheet',
      generatedAt: at,
      sheetRows: L.data.length,
      purchaseRows: P ? P.data.length : 0,
      leads,
      purchases: rows.map((r) => r.p),
      mailings: mailings ? mailings.map((m) => m.m) : null,
      mailingWaves: waveRows ? wavesFromRows(waveRows) : null,
      dupes: fromTab.dupes,
      insights: insights.file,
    },
    ids: {
      generatedAt: at, leads: kept.map((r) => r.ns), purchases: rows.map((r) => r.ns), mailings: mailings ? mailings.map((m) => m.ns) : [],
      ...insights.ids,
    },
  };
}

type PrivatePart = Pick<PrivateIds, 'analysis' | 'inquiries' | 'feedback' | 'stalls' | 'questions'>;

/** ארבע הלשוניות של תובנות השיחה. כל לשונית לחוד: חסרה או בלי עמודת חובה = null, בלי להפיל את השאר */
export function insightsFromRows(extra: InsightRows, readAt: string, leadOfNs: Map<string, number>, nameOfNs: Map<string, string>): { file: Insights; ids: PrivatePart } {
  const start = israelDayStart(INSIGHTS_START_DAY).getTime();
  const iso = (v: string) => parseSheetDate(v)?.toISOString() ?? null;
  const num = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const part = <T,>(rows: T[]): Part<T> => ({ readAt, rows });
  const lead = (ns: string) => (ns !== '' ? (leadOfNs.get(ns) ?? null) : null);
  const name = (own: string, ns: string) => cleanText(own) ?? nameOfNs.get(ns) ?? '';
  // מספר סידורי לכל קוד מזהה בתוך לשונית (לספירת אנשים)
  const counter = () => {
    const ids = new Map<string, number>();
    let next = 0;
    return (ns: string) => {
      if (ns === '') return next++;
      let id = ids.get(ns);
      if (id === undefined) {
        id = next++;
        ids.set(ns, id);
      }
      return id;
    };
  };

  let analysis: Part<AnalysisRow> | null = null;
  let analysisIds: PrivateRows | null = null;
  const A = extra.analysis ? optionalIndexer(extra.analysis, ANALYSIS_COLUMNS) : null;
  if (A) {
    const rows: AnalysisRow[] = [];
    const priv: PrivateRows = { ns: [], names: [], texts: [] };
    for (const r of A.data) {
      const ns = A.col(r, 'קוד מזהה');
      rows.push({
        at: iso(A.col(r, 'תאריך כניסה')), lead: lead(ns), path: cleanText(A.col(r, 'מסלול')), bought: yesNoExact(A.col(r, 'קנה')),
        step: cleanText(A.col(r, 'שלב אחרון')), reason: cleanText(A.col(r, 'סיבת נטישה')), agent: yesNoExact(A.col(r, 'פנה לנציג')) === 'yes',
        inquiry: cleanText(A.col(r, 'קטגוריית פנייה')), unanswered: num(A.col(r, 'שאלות ללא מענה')), feedback: cleanText(A.col(r, 'קטגוריית משוב')),
        messages: num(A.col(r, 'הודעות לקוח')), scannedAt: iso(A.col(r, 'נסרק ב:')), removal: cleanText(A.col(r, 'סיבת הסרה')),
        basis: cleanText(A.col(r, 'מקור הסיבה')),
      });
      priv.ns.push(ns);
      priv.names.push(name('', ns));
      priv.texts.push(clip(A.col(r, 'פירוט קצר')));
    }
    analysis = part(rows);
    analysisIds = priv;
  }

  let questions: Part<QuestionRow> | null = null;
  let examples: string[][] | null = null;
  const Q = extra.questions ? optionalIndexer(extra.questions, QUESTION_COLUMNS) : null;
  if (Q) {
    const rows: QuestionRow[] = [];
    examples = [];
    for (const r of Q.data) {
      const text = cleanText(Q.col(r, 'שאלה'));
      if (text === null) continue;
      rows.push({
        text, category: cleanText(Q.col(r, 'קטגוריה')), count: num(Q.col(r, 'מופעים')) ?? 0, lastAt: iso(Q.col(r, 'נשאל לאחרונה')),
        status: cleanText(Q.col(r, 'סטטוס')), answer: cleanText(Q.col(r, 'תשובת יקיר')),
      });
      examples.push(Q.col(r, 'דוגמאות (קוד מזהה)').split(/[,\s]+/).filter((x) => x !== ''));
    }
    questions = part(rows);
  }

  // פניות ומשובים: מ-2/10. שורה עם תאריך שלא פוענח נשארת (נספרת רק בטווח "הכול")
  const dated = <C extends string>(X: { col: (r: string[], name: string) => string; data: string[][] }, dateCol: C) =>
    X.data.filter((r) => {
      const d = parseSheetDate(X.col(r, dateCol));
      return !d || d.getTime() >= start;
    });

  let inquiries: Part<InquiryRow> | null = null;
  let inquiryIds: PrivateRows | null = null;
  const I = extra.inquiries ? optionalIndexer(extra.inquiries, INQUIRY_COLUMNS) : null;
  if (I) {
    const who = counter();
    const rows: InquiryRow[] = [];
    const priv: PrivateRows = { ns: [], names: [], texts: [] };
    for (const r of dated(I, 'תאריך פניה')) {
      const ns = I.col(r, 'מזהה לקוח');
      rows.push({ at: iso(I.col(r, 'תאריך פניה')), lead: lead(ns), who: who(ns), category: cleanText(I.col(r, 'קטגוריה')) });
      priv.ns.push(ns);
      priv.names.push(name(I.col(r, 'שם לקוח'), ns));
      priv.texts.push(clip(I.col(r, 'תוכן הפניה')));
    }
    inquiries = part(rows);
    inquiryIds = priv;
  }

  let feedback: Part<FeedbackRow> | null = null;
  let feedbackIds: PrivateRows | null = null;
  const F = extra.feedback ? optionalIndexer(extra.feedback, FEEDBACK_COLUMNS) : null;
  if (F) {
    const who = counter();
    const rows: FeedbackRow[] = [];
    const priv: PrivateRows = { ns: [], names: [], texts: [] };
    for (const r of dated(F, 'תאריך')) {
      const ns = F.col(r, 'קוד מזהה');
      const exam = F.col(r, 'מבחן');
      rows.push({
        at: iso(F.col(r, 'תאריך')), lead: lead(ns), who: who(ns), category: cleanText(F.col(r, 'קטגוריה')),
        exam: exam === 'עבר' ? 'passed' : exam === 'לא עבר' ? 'failed' : null,
      });
      priv.ns.push(ns);
      priv.names.push(name(F.col(r, 'שם לקוח'), ns));
      priv.texts.push(clip(F.col(r, 'הערות')));
    }
    feedback = part(rows);
    feedbackIds = priv;
  }

  // נקודות עצירה: כל השורות, בלי סינון תאריך (הסקריפט כותב רק לידים מהימים האחרונים)
  let stalls: Part<StallRow> | null = null;
  let stallIds: PrivateRows | null = null;
  const S = extra.stalls ? optionalIndexer(extra.stalls, STALL_COLUMNS) : null;
  if (S) {
    const rows: StallRow[] = [];
    const priv: PrivateRows = { ns: [], names: [], texts: [] };
    for (const r of S.data) {
      const ns = S.col(r, 'קוד מזהה');
      rows.push({
        at: iso(S.col(r, 'תאריך כניסה')), lead: lead(ns), process: cleanText(S.col(r, 'שם תהליך')), stop: cleanText(S.col(r, 'נקודת עצירה')),
        detail: cleanText(S.col(r, 'פירוט')), messages: num(S.col(r, 'הודעות לקוח')), lastAt: iso(S.col(r, 'פעילות אחרונה')), scannedAt: iso(S.col(r, 'נסרק ב:')),
      });
      priv.ns.push(ns);
      priv.names.push(name('', ns));
      priv.texts.push('');
    }
    stalls = part(rows);
    stallIds = priv;
  }

  return {
    file: { analysis, questions, inquiries, feedback, stalls },
    ids: { analysis: analysisIds, inquiries: inquiryIds, feedback: feedbackIds, stalls: stallIds, questions: examples },
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
  return mailingsWithIds(rows)?.map((x) => x.m) ?? null;
}

function mailingsWithIds(rows: string[][]): { m: MailingPurchase; ns: string }[] | null {
  const M = optionalIndexer(rows, MAILING_COLUMNS);
  if (!M) return null;
  const c = (r: string[], name: MailingColumn) => M.col(r, name);
  const ids = new Map<string, number>();
  let next = 0;
  const out: { m: MailingPurchase; ns: string }[] = [];
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
      ns,
      m: {
        campaign: c(r, 'קמפיין'), wave: c(r, 'גל'), sentAt: parseSheetDate(c(r, 'תאריך שליחה'))?.toISOString() ?? null, at: at.toISOString(), buyer,
        product: cleanText(c(r, 'מוצר')), amount: parseAmount(c(r, 'סכום')), viaLink: c(r, 'דרך קישור הקמפיין') === BOT_YES,
        coupon: couponCode(c(r, 'קופון')), bot: botFlag(c(r, 'של הבוט')), reason: cleanText(c(r, 'סיבה')),
      },
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
): { rows: { ns: string; phone: string | null; p: Purchase }[]; dupes: string[] } {
  const rows: { at: Date; ns: string; phone: string | null; p: Purchase }[] = [];
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
      at, ns, phone: phoneKey(col(cells, 'טלפון')),
      p: {
        at: at.toISOString(), lead, product, amount, source, sourceGroup: sourceGroupOf(source, productNames),
        campaign: cleanText(col(cells, 'utm_campaign')), fromLead: false, bot: botFlag(col(cells, 'של הבוט')),
        reason: cleanText(col(cells, 'סיבה')), coupon: couponCode(col(cells, 'קופון מהרכישה')), buyer: buyerId(ns), person: 0,
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
  // התאריכים של השורות הכפולות שלא נספרו, כדי להראות כמה הן בכל טווח (הנחיית המנהל, 1/11/2026)
  const dupes = rows.filter((r) => dropped.has(r)).map((r) => r.p.at).sort();
  return { rows: rows.filter((r) => !dropped.has(r)).map((r) => ({ ns: r.ns, phone: r.phone, p: r.p })), dupes };
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
    person: 0,
  };
}
