/**
 * "תובנות שיחה" (הנחיית המנהל 3/11/2026, #26): ההגדרות והחישובים של ארבעת הכרטיסים ושורת ההסרות.
 * הנתונים מגיעים מהסריקה של המנהל בגיליון. הדשבורד לא מסווג ולא מחשב סיבות: רק סופר את מה שכתוב.
 */
import type { AnalysisRow, FeedbackRow, InquiryRow, QuestionRow } from './leads/types';
import { inside, timeSeries, type Bucket, type Range } from './metrics';
import { israelDayStart } from './sheet/parse';

/** הנתונים מתחילים ביום הזה. בטווח שמתחיל לפני כן כתוב בסקשן "מ-2/10 בלבד" */
export const INSIGHTS_FROM = '2026-10-02';
/** בדיקות פנימיות: לא נספרות בשום מקום בסקשן */
export const TEST_REASON = 'שיחת בדיקה';
/** ניהל שיחה וקנה */
export const BOUGHT_REASON = 'אין נטישה - רכש';
/** שורה שעוד מחכה לקריאת הצ'אט: לא בגרף, נספרת ב"בבדיקה" */
export const PENDING_REASON = 'לא ברור מהסיכום';
/** בלי שיחה: מוצגים בנפרד, לא "נטישה" */
export const NO_CONVERSATION = ['לא כתב לבוט', 'הודעה בודדת בלבד', 'רכש בלי שיחה'];
/** הממצא הכי חשוב לשיפור: צבע אזהרה אחד בכל הדף */
export const BOT_FAILURE = 'הבוט לא נתן מענה או הבטיח ולא קיים';
export const STARTED_Q = 'התחיל שאלון';
const STEP_N = /^התחיל שאלון \(שלב (\d+)\)$/;
/** סדר השלבים בגרף "איפה נעצרו". ערך אחר נכנס אחריהם */
export const STEP_ORDER = ['לא התחיל שאלון', STARTED_Q, 'סיים שאלון', 'אחרי מבחן', 'הגיע לתשלום', 'רכש בבוט', 'רכש'];
/** המסלולים במתג של כרטיס הנטישה */
export const PATHS = ['מבחן - עבר', 'מבחן - לא עבר', 'פופאפ', 'תהליך ראשי'];
export const OTHER = 'אחר';
/** קטגוריית פנייה עם פחות פניות מזה בטווח נכנסת ל"אחר" */
export const MIN_INQUIRIES = 5;
/** סטטוס של שאלה שכבר קיבלה תשובה */
export const ANSWERED = ['נענה', 'עודכן במאגר'];
/** "מקור הסיבה" של שיחה שהצ'אט שלה נקרא: מהן נספרות השאלות ליקיר */
export const CHAT_BASIS = "צ'אט";

/** שורה עם המיקום שלה בקובץ, לשם ולקישור מהקובץ הפרטי */
export interface Indexed<T> {
  r: T;
  i: number;
}

/** מה שמסנן את כל הכרטיסים: טווח, מקור ותהליך (keep: הלידים שנשארו, null = בלי סינון), ושיחות בדיקה */
export interface Scope {
  range: Range;
  keep: Set<number> | null;
  testLeads: Set<number>;
}

/** בטווח. שורה בלי תאריך נספרת רק כשאין טווח (הכול) */
export function inRangeOrAll(at: string | null, range: Range): boolean {
  return at === null ? !range.from && !range.to : inside(at, range);
}

/** האם הטווח מתחיל לפני שהנתונים מתחילים (או "הכול") */
export function startsBeforeData(range: Range): boolean {
  return !range.from || range.from.getTime() < israelDayStart(INSIGHTS_FROM).getTime();
}

/** הלידים של שיחות הבדיקה, כדי להוציא גם את הפניות והמשובים שלהם */
export function testLeadsOf(analysis: AnalysisRow[] | null): Set<number> {
  return new Set((analysis ?? []).filter((r) => r.reason === TEST_REASON && r.lead !== null).map((r) => r.lead!));
}

function inScope<T extends { lead: number | null }>(rows: T[], at: (r: T) => string | null, scope: Scope): Indexed<T>[] {
  const out: Indexed<T>[] = [];
  rows.forEach((r, i) => {
    if (!inRangeOrAll(at(r), scope.range)) return;
    if (scope.keep && (r.lead === null || !scope.keep.has(r.lead))) return;
    if (r.lead !== null && scope.testLeads.has(r.lead)) return;
    out.push({ r, i });
  });
  return out;
}

export interface Count<T> {
  name: string;
  count: number;
  rows: Indexed<T>[];
}

function group<T>(xs: Indexed<T>[], key: (x: T) => string): Count<T>[] {
  const m = new Map<string, Indexed<T>[]>();
  for (const x of xs) {
    const k = key(x.r);
    const g = m.get(k);
    if (g) g.push(x);
    else m.set(k, [x]);
  }
  return [...m.entries()].map(([name, rows]) => ({ name, count: rows.length, rows })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------- למה נטשו ----------

/** "התחיל שאלון (שלב 3)" -> "התחיל שאלון"; ריק -> "לא ידוע" */
export function stopOf(step: string | null): string {
  if (step === null) return 'לא ידוע';
  return STEP_N.test(step) ? STARTED_Q : step;
}

export interface AbandonView {
  /** השורות בטווח ובמסלול שנבחר, בלי שיחות בדיקה */
  rows: Indexed<AnalysisRow>[];
  /** ניהלו שיחה וקנו */
  bought: number;
  /** ניהלו שיחה ולא קנו (הנטושים) */
  abandoned: number;
  /** הסיבות של הנטושים, מהגדולה לקטנה. הסכום = abandoned */
  reasons: Count<AnalysisRow>[];
  /** איפה נעצרו: כל מי שלא קנה, כולל מי שלא ניהל שיחה, לפי סדר השלבים */
  stops: Count<AnalysisRow>[];
  /** "התחיל שאלון" לפי מספר השלב */
  stepN: { name: string; count: number }[];
  /** בלי שיחה, לפי NO_CONVERSATION */
  noConversation: { name: string; count: number }[];
  /** "לא ברור מהסיכום" או סיבה ריקה */
  pending: number;
}

/**
 * כרטיס "למה נטשו" (סעיף 4). נטוש: "קנה" = לא, והסיבה אינה בלי שיחה, רכישה, "לא ברור מהסיכום" או ריקה.
 * "אין נטישה - רכש" עם "קנה" = לא (רכישה לפני 2/10) לא נכנס לאף קבוצה.
 */
export function abandonView(analysis: AnalysisRow[], scope: Scope, path: string | null): AbandonView {
  const rows = inScope(analysis, (r) => r.at, scope).filter((x) => x.r.reason !== TEST_REASON && (path === null || x.r.path === path));
  const pendingOf = (r: AnalysisRow) => r.reason === null || r.reason === PENDING_REASON;
  const abandoned = rows.filter((x) => x.r.bought === 'no' && !pendingOf(x.r) && x.r.reason !== BOUGHT_REASON && !NO_CONVERSATION.includes(x.r.reason!));
  const notBought = rows.filter((x) => x.r.bought === 'no');
  const stops = group(notBought, (r) => stopOf(r.step)).sort((a, b) => {
    const ia = STEP_ORDER.indexOf(a.name);
    const ib = STEP_ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.count - a.count;
  });
  const n = new Map<string, number>();
  for (const x of notBought) {
    if (stopOf(x.r.step) !== STARTED_Q) continue;
    const m = x.r.step!.match(STEP_N);
    const k = m ? `שלב ${m[1]}` : 'בלי מספר שלב';
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  const stepNum = (k: string) => (k.startsWith('שלב ') ? Number(k.slice(4)) : 999);
  return {
    rows,
    bought: rows.filter((x) => x.r.bought === 'yes' && x.r.reason === BOUGHT_REASON).length,
    abandoned: abandoned.length,
    reasons: group(abandoned, (r) => r.reason!),
    stops,
    stepN: [...n.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => stepNum(a.name) - stepNum(b.name)),
    noConversation: NO_CONVERSATION.map((name) => ({ name, count: rows.filter((x) => x.r.reason === name).length })),
    pending: rows.filter((x) => pendingOf(x.r)).length,
  };
}

// ---------- פניות שירות ----------

export interface CategoryRow<T> extends Count<T> {
  /** אנשים שונים (לפי קוד מזהה) */
  people: number;
  /** מתוך המסווגים */
  share: number;
}

function categories<T extends { category: string | null; who: number }>(xs: Indexed<T>[], minCount: number): CategoryRow<T>[] {
  const counted = group(xs, (r) => r.category!);
  const big = counted.filter((c) => c.count >= minCount && c.name !== OTHER);
  const rest = counted.filter((c) => c.count < minCount || c.name === OTHER).flatMap((c) => c.rows);
  const all = rest.length ? [...big, { name: OTHER, count: rest.length, rows: rest }] : big;
  return all.map((c) => ({ ...c, people: new Set(c.rows.map((x) => x.r.who)).size, share: xs.length ? c.count / xs.length : 0 }));
}

export interface InquiryView {
  /** פניות מסווגות בטווח */
  categorized: number;
  /** פניות בלי קטגוריה (עוד בסיווג) */
  pending: number;
  /** אנשים שונים מבין המסווגות */
  people: number;
  /** לפי קטגוריה, מהגדולה לקטנה, ו"אחר" בסוף (כולל קטגוריות עם פחות מ-5 פניות) */
  cats: CategoryRow<InquiryRow>[];
  /** פניות לפי שבוע: שלוש הקטגוריות הגדולות ו"שאר" */
  weekly: { key: string; values: number[] }[];
  top3: string[];
}

/** כרטיס "פניות שירות" (סעיף 5). כל שורה היא פנייה; "סוג פניה" הישן לא בשימוש */
export function inquiryView(inquiries: InquiryRow[], scope: Scope, bucket: Bucket = 'week'): InquiryView {
  const rows = inScope(inquiries, (r) => r.at, scope);
  const done = rows.filter((x) => x.r.category !== null);
  const cats = categories(done, MIN_INQUIRIES);
  const top3 = cats.filter((c) => c.name !== OTHER).slice(0, 3).map((c) => c.name);
  const dated = done.filter((x) => x.r.at !== null);
  return {
    categorized: done.length,
    pending: rows.length - done.length,
    people: new Set(done.map((x) => x.r.who)).size,
    cats,
    top3,
    weekly: timeSeries(dated, (x) => x.r.at!, bucket, top3.length + 1, (x) => {
      const v = new Array<number>(top3.length + 1).fill(0);
      const k = top3.indexOf(x.r.category!);
      v[k < 0 ? top3.length : k] = 1;
      return v;
    }),
  };
}

// ---------- משובים אחרי מבחן ----------

export type ExamFilter = 'all' | 'passed' | 'failed';

export interface FeedbackView {
  categorized: number;
  pending: number;
  cats: CategoryRow<FeedbackRow>[];
}

/** כרטיס "משובים אחרי מבחן" (סעיף 6), עם מתג עבר / לא עבר */
export function feedbackView(feedback: FeedbackRow[], scope: Scope, exam: ExamFilter): FeedbackView {
  const rows = inScope(feedback, (r) => r.at, scope).filter((x) => exam === 'all' || x.r.exam === exam);
  const done = rows.filter((x) => x.r.category !== null);
  // כאן אין איחוד ל"אחר": יש עד 7 קטגוריות
  return { categorized: done.length, pending: rows.length - done.length, cats: categories(done, 0) };
}

// ---------- שאלות ליקיר ----------

export interface QuestionView {
  /** כל השאלות בטווח (לפי "נשאל לאחרונה"), מהנפוצה */
  all: Indexed<QuestionRow>[];
  /** מה שמוצג: רק מי שהופיעה פעמיים ומעלה, או הכול */
  shown: Indexed<QuestionRow>[];
  waiting: number;
  answered: number;
}

/** כרטיס "שאלות ליקיר" (סעיף 7). המופעים נספרים רק מהצ'אטים שנקראו (מדגם) */
export function questionView(questions: QuestionRow[], range: Range, showAll: boolean): QuestionView {
  const all = questions
    .map((r, i) => ({ r, i }))
    .filter((x) => inRangeOrAll(x.r.lastAt, range))
    .sort((a, b) => b.r.count - a.r.count || (b.r.lastAt ?? '').localeCompare(a.r.lastAt ?? ''));
  const answered = all.filter((x) => x.r.status !== null && ANSWERED.includes(x.r.status)).length;
  return { all, shown: showAll ? all : all.filter((x) => x.r.count >= 2), waiting: all.length - answered, answered };
}

/** כמה שיחות נקראו (המדגם של השאלות), בעיגול לעשרות: "כ-460" */
export function sampleSize(analysis: AnalysisRow[] | null): number {
  const n = (analysis ?? []).filter((r) => r.basis === CHAT_BASIS && r.reason !== TEST_REASON).length;
  return Math.round(n / 10) * 10;
}

// ---------- הסירו את עצמם, ומתי נסרק ----------

/** שורת "הסירו את עצמם" (סעיף 8): כמה, ולפי "סיבת הסרה". בלי שמות */
export function removalView(analysis: AnalysisRow[], scope: Scope): { count: number; reasons: { name: string; count: number }[] } {
  const rows = inScope(analysis, (r) => r.at, scope).filter((x) => x.r.reason !== TEST_REASON && x.r.removal !== null);
  return { count: rows.length, reasons: group(rows, (r) => r.removal!).map(({ name, count }) => ({ name, count })) };
}

/** ה"נסרק ב:" האחרון, לתאריך העדכון ליד כותרת הסקשן */
export function lastScan(analysis: AnalysisRow[] | null): string | null {
  let last: string | null = null;
  for (const r of analysis ?? []) if (r.scannedAt && (!last || r.scannedAt > last)) last = r.scannedAt;
  return last;
}
