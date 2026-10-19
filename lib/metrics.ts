import type { Lead } from './leads/types';

export interface Range {
  /** כולל, או null = מההתחלה */
  from: Date | null;
  /** לא כולל, או null = עד הסוף */
  to: Date | null;
}

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "2026-10-19" לפי שעון ישראל */
export function dayKey(iso: string | Date): string {
  return ymd.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** "2026-10" לפי שעון ישראל */
export function monthKey(iso: string | Date): string {
  return dayKey(iso).slice(0, 7);
}

function inside(iso: string, range: Range): boolean {
  const t = new Date(iso).getTime();
  return (!range.from || t >= range.from.getTime()) && (!range.to || t < range.to.getTime());
}

export function inRange(leads: Lead[], range: Range): Lead[] {
  return leads.filter((l) => inside(l.at, range));
}

/** שילם בזכות הבוט: סטטוס שאלון converted (החלטת המנהל, #12). */
export function paidByBot(l: Lead): boolean {
  return l.qStatus === 'converted';
}

/** שילם, אבל לא בהכרח בזכות הבוט: סטטוס שאלון payment (החלטת המנהל, #16). */
export function paidOther(l: Lead): boolean {
  return l.qStatus === 'payment';
}

/** רכש: converted או payment (#16). */
export function purchased(l: Lead): boolean {
  return paidByBot(l) || paidOther(l);
}

/** התחיל את המסע (התחלת שיחה), טכנית: ענה לצ'אטבוט, עמודה I (החלטת המנהל, #16). */
export function startedJourney(l: Lead): boolean {
  return l.answered;
}

/** שיחה אמיתית, לפי סוכן ה-AI שקורא את השיחות: עמודה BD "התחיל שיחה" = כן (#20). */
export function realConversation(l: Lead): boolean {
  return l.aiConversation === 'yes';
}

/** הסוכן כבר קרא את השיחה: עמודה BD מלאה, כן או לא (#20). */
export function aiAnalyzed(l: Lead): boolean {
  return l.aiConversation !== null;
}

/**
 * התחיל שאלון: עמודה K, "שלב בשאלון", מלאה (#16).
 * בנתונים עמודה K ריקה אצל רוב מי שסיים את השאלון, ולכן נחשב גם מי שעמודה L שלו started, finished או converted:
 * מי שסיים, התחיל.
 */
export function startedQuestionnaire(l: Lead): boolean {
  return l.step !== null || l.qStatus === 'started' || finishedQuestionnaire(l);
}

/** סיים שאלון: עמודה L, finished או converted (#16). */
export function finishedQuestionnaire(l: Lead): boolean {
  return l.qStatus === 'finished' || l.qStatus === 'converted';
}

export const PASSED = 'עבר';
export const FAILED = 'לא עבר';

/** שם המוצר של רכישה: "מוצר שנקנה", ואם ריק אז "מבחן" (לבירור, #12). */
export function productOf(l: Lead): string {
  return l.product ?? l.test ?? 'לא צוין';
}

export interface Summary {
  leads: number;
  startedJourney: number;
  /** כמה שיחות הסוכן כבר קרא */
  aiAnalyzed: number;
  /** מתוכן, שיחה אמיתית */
  realConversations: number;
  passed: number;
  failed: number;
  purchased: number;
  /** רכשו מתוך מי שהתחיל שיחה */
  purchasedOfStarted: number;
  paidBot: number;
  paidOther: number;
  /** סך הכול שולם: עמודה AM, על כל מי שרכש */
  totalPaid: number;
  revenueBot: number;
  revenueOther: number;
  avgDealBot: number | null;
  avgDealAll: number | null;
}

export function summarize(leads: Lead[]): Summary {
  const sum = (xs: Lead[]) => xs.reduce((s, l) => s + (l.amount ?? 0), 0);
  const withAmount = (xs: Lead[]) => xs.filter((l) => (l.amount ?? 0) > 0);
  const bot = leads.filter(paidByBot);
  const other = leads.filter(paidOther);
  const all = leads.filter(purchased);
  const botA = withAmount(bot);
  const allA = withAmount(all);
  return {
    leads: leads.length,
    startedJourney: leads.filter(startedJourney).length,
    aiAnalyzed: leads.filter(aiAnalyzed).length,
    realConversations: leads.filter(realConversation).length,
    passed: leads.filter((l) => l.status === PASSED).length,
    failed: leads.filter((l) => l.status === FAILED).length,
    purchased: all.length,
    purchasedOfStarted: all.filter(startedJourney).length,
    paidBot: bot.length,
    paidOther: other.length,
    totalPaid: sum(all),
    revenueBot: sum(bot),
    revenueOther: sum(other),
    avgDealBot: botA.length ? sum(botA) / botA.length : null,
    avgDealAll: allA.length ? sum(allA) / allA.length : null,
  };
}

export const UNSET = 'לא סווג';

/**
 * "אופן שיחה" (עמודה BE) נכתב על ידי סוכן ה-AI, והקטגוריות שלו פתוחות (שירותי, מכירתי, טכני, פניית שירות...).
 * הדשבורד מציג כל ערך כמו שהוא, ומאחד רק רווחים. כשתיקבע רשימה סגורה לסוכן, היא תיכנס ל-MODE_ORDER.
 */
export const MODE_ORDER: string[] = [];

export function normalizeMode(m: string | null): string | null {
  if (!m) return null;
  const t = m.replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

/** הקטגוריות של אופן שיחה: קודם לפי MODE_ORDER, אחר כך מהנפוצה לנדירה, ו"לא סווג" בסוף. */
export function modesOf(leads: Lead[]): string[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const m = normalizeMode(l.mode);
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const rest = [...counts.keys()].filter((m) => !MODE_ORDER.includes(m)).sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  return [...MODE_ORDER.filter((m) => counts.has(m)), ...rest, UNSET];
}

export interface BreakdownRow {
  name: string;
  leads: number;
  /** התחילו שיחה: ענו לצ'אטבוט */
  started: number;
  /** הסוכן קרא את השיחה */
  analyzed: number;
  /** שיחה אמיתית לפי הסוכן */
  real: number;
  startedQ: number;
  finishedQ: number;
  purchased: number;
  paidBot: number;
  paidOther: number;
  totalPaid: number;
  passed: number;
  failed: number;
  /** לפי אופן שיחה, באותו סדר כמו modes */
  byMode: number[];
}

export interface Breakdown {
  rows: BreakdownRow[];
  total: BreakdownRow;
  modes: string[];
}

/** טבלת פילוח: לכל קבוצה כמה לידים, שאלון, רכישות, תשלום, עברו ונכשלו, ואופן שיחה. */
export function breakdown(leads: Lead[], groupOf: (l: Lead) => string, order?: string[]): Breakdown {
  const modes = modesOf(leads);
  const empty = (name: string): BreakdownRow => ({
    name, leads: 0, started: 0, analyzed: 0, real: 0, startedQ: 0, finishedQ: 0, purchased: 0, paidBot: 0, paidOther: 0, totalPaid: 0, passed: 0, failed: 0,
    byMode: modes.map(() => 0),
  });
  const add = (r: BreakdownRow, l: Lead) => {
    r.leads++;
    if (startedJourney(l)) r.started++;
    if (aiAnalyzed(l)) r.analyzed++;
    if (realConversation(l)) r.real++;
    if (startedQuestionnaire(l)) r.startedQ++;
    if (finishedQuestionnaire(l)) r.finishedQ++;
    if (purchased(l)) {
      r.purchased++;
      r.totalPaid += l.amount ?? 0;
    }
    if (paidByBot(l)) r.paidBot++;
    if (paidOther(l)) r.paidOther++;
    if (l.status === PASSED) r.passed++;
    if (l.status === FAILED) r.failed++;
    r.byMode[modes.indexOf(normalizeMode(l.mode) ?? UNSET)]++;
  };
  const groups = new Map<string, BreakdownRow>();
  for (const name of order ?? []) groups.set(name, empty(name));
  const total = empty('סך הכול');
  for (const l of leads) {
    const g = groupOf(l);
    if (!groups.has(g)) groups.set(g, empty(g));
    add(groups.get(g)!, l);
    add(total, l);
  }
  const rows = [...groups.values()];
  if (!order) rows.sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
  return { rows, total, modes };
}

/** קבוצה לפי תוצאת המבחן, בסדר: עבר, לא עבר, בלי סטטוס. */
export function resultOf(l: Lead): string {
  return l.status === PASSED || l.status === FAILED ? l.status : 'בלי סטטוס';
}
export const RESULT_ORDER = [PASSED, FAILED, 'בלי סטטוס'];

export interface TestStat {
  name: string;
  total: number;
  passed: number;
  failed: number;
  /** אחוז מעבר מתוך מי שיש לו תוצאה, null כשאין */
  passRate: number | null;
}

export function testStats(leads: Lead[]): TestStat[] {
  const m = new Map<string, TestStat>();
  for (const l of leads) {
    if (!l.test) continue;
    const s = m.get(l.test) ?? { name: l.test, total: 0, passed: 0, failed: 0, passRate: null };
    s.total++;
    if (l.status === PASSED) s.passed++;
    if (l.status === FAILED) s.failed++;
    m.set(l.test, s);
  }
  return [...m.values()]
    .map((s) => ({ ...s, passRate: s.passed + s.failed ? s.passed / (s.passed + s.failed) : null }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export type Bucket = 'day' | 'week' | 'month';

/** "2026-10-19" + n ימים */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** המפתח של התקופה: יום "2026-10-19", שבוע לפי יום ראשון שלו "2026-10-18", חודש "2026-10". שעון ישראל. */
export function bucketOf(iso: string, b: Bucket): string {
  const d = dayKey(iso);
  if (b === 'day') return d;
  if (b === 'month') return d.slice(0, 7);
  return addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay());
}

function nextBucket(key: string, b: Bucket): string {
  if (b === 'day') return addDays(key, 1);
  if (b === 'week') return addDays(key, 7);
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** יחידת הזמן שמתאימה לטווח: עד חודשיים לפי יום, עד חצי שנה לפי שבוע, מעבר לזה לפי חודש. */
export function autoBucket(leads: Lead[]): Bucket {
  if (!leads.length) return 'day';
  const days = leads.map((l) => dayKey(l.at)).sort();
  const span = (new Date(`${days[days.length - 1]}T12:00:00Z`).getTime() - new Date(`${days[0]}T12:00:00Z`).getTime()) / 86_400_000 + 1;
  return span <= 62 ? 'day' : span <= 182 ? 'week' : 'month';
}

/**
 * סדרה לאורך זמן, כולל תקופות בלי נתונים (באפס), מהראשונה לאחרונה.
 * values מחזיר מערך באורך width: כמה להוסיף לכל סדרה עבור הפריט.
 */
export function timeSeries<T>(items: T[], at: (x: T) => string, b: Bucket, width: number, values: (x: T) => number[]): { key: string; values: number[] }[] {
  if (!items.length) return [];
  const m = new Map<string, number[]>();
  for (const x of items) {
    const k = bucketOf(at(x), b);
    const v = m.get(k) ?? new Array<number>(width).fill(0);
    values(x).forEach((n, i) => (v[i] += n));
    m.set(k, v);
  }
  const keys = [...m.keys()].sort();
  const out: { key: string; values: number[] }[] = [];
  for (let k = keys[0]; ; k = nextBucket(k, b)) {
    out.push({ key: k, values: m.get(k) ?? new Array<number>(width).fill(0) });
    if (k >= keys[keys.length - 1]) break;
  }
  return out;
}

/** עברו ונכשלו לאורך זמן */
export function passFailOverTime(leads: Lead[], b: Bucket): { key: string; passed: number; failed: number }[] {
  return timeSeries(leads, (l) => l.at, b, 2, (l) => [l.status === PASSED ? 1 : 0, l.status === FAILED ? 1 : 0])
    .map(({ key, values: [passed, failed] }) => ({ key, passed, failed }));
}

/** כמה הסירו את עצמם, לפי תאריך ההסרה (ולא לפי תאריך הכניסה). */
export function removedIn(all: Lead[], range: Range): number {
  return all.filter((l) => l.removedAt && inside(l.removedAt, range)).length;
}

export interface Purchase {
  at: string;
  channel: 'bot' | 'other';
  product: string;
  amount: number | null;
}

export function purchases(leads: Lead[]): Purchase[] {
  return leads
    .filter(purchased)
    .map((l) => ({ at: l.at, channel: paidByBot(l) ? 'bot' : 'other', product: productOf(l), amount: l.amount }));
}

export interface ProductStat {
  name: string;
  count: number;
  revenue: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export function productStats(ps: Purchase[]): ProductStat[] {
  const by = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const p of ps) {
    counts.set(p.product, (counts.get(p.product) ?? 0) + 1);
    if (p.amount && p.amount > 0) {
      const a = by.get(p.product) ?? [];
      a.push(p.amount);
      by.set(p.product, a);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => {
      const a = by.get(name) ?? [];
      const revenue = a.reduce((s, x) => s + x, 0);
      return {
        name,
        count,
        revenue,
        avg: a.length ? revenue / a.length : null,
        min: a.length ? Math.min(...a) : null,
        max: a.length ? Math.max(...a) : null,
      };
    })
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}

export interface Matrix {
  /** עמודות: חודשים, מהישן לחדש */
  months: string[];
  /** שורות: שמות, מהנפוץ לנדיר */
  rows: { name: string; total: number; byMonth: number[] }[];
  monthTotals: number[];
}

/** טבלה של שם מול חודש, עם ספירות מדויקות. */
export function matrixByMonth<T>(items: T[], name: (x: T) => string | null, at: (x: T) => string): Matrix {
  const months = [...new Set(items.map((x) => monthKey(at(x))))].sort();
  const mi = new Map(months.map((m, i) => [m, i]));
  const rows = new Map<string, number[]>();
  for (const x of items) {
    const n = name(x);
    if (!n) continue;
    const r = rows.get(n) ?? new Array<number>(months.length).fill(0);
    r[mi.get(monthKey(at(x)))!]++;
    rows.set(n, r);
  }
  const list = [...rows.entries()]
    .map(([n, byMonth]) => ({ name: n, total: byMonth.reduce((s, v) => s + v, 0), byMonth }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const monthTotals = months.map((_, i) => list.reduce((s, r) => s + r.byMonth[i], 0));
  return { months, rows: list, monthTotals };
}

/** כמה לידים בכל יום בטווח, כולל ימים בלי לידים. */
export function perDay(leads: Lead[]): { day: string; count: number }[] {
  if (!leads.length) return [];
  const counts = new Map<string, number>();
  for (const l of leads) counts.set(dayKey(l.at), (counts.get(dayKey(l.at)) ?? 0) + 1);
  const days = [...counts.keys()].sort();
  const out: { day: string; count: number }[] = [];
  const d = new Date(`${days[0]}T12:00:00Z`);
  const last = days[days.length - 1];
  while (true) {
    const k = d.toISOString().slice(0, 10);
    out.push({ day: k, count: counts.get(k) ?? 0 });
    if (k >= last) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** ספירה לפי ערך, מהנפוץ לנדיר. */
export function countBy<T>(items: T[], key: (x: T) => string | null): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
