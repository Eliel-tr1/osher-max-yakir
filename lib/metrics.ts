import type { Lead, LeadsFile, Purchase } from './leads/types';

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

// ---------- לידים עם הרכישות שלהם ----------

/** ליד עם המיקום שלו בקובץ וסיכום הרכישות שלו, כדי שסינון לא יאבד את הקשר לרכישות. */
export interface LeadX extends Lead {
  i: number;
  /** כמה רכישות יש לו בלשונית הרכישות (כולל בלי סכום) */
  purchases: number;
  /** כמה שילם בסך הכול */
  spent: number;
}

export function annotate(file: LeadsFile): LeadX[] {
  const leads: LeadX[] = file.leads.map((l, i) => ({ ...l, i, purchases: 0, spent: 0 }));
  for (const p of file.purchases) {
    if (p.lead === null) continue;
    const l = leads[p.lead];
    if (!l) continue;
    l.purchases++;
    l.spent += p.amount ?? 0;
  }
  return leads;
}

export function inRange<T extends { at: string }>(items: T[], range: Range): T[] {
  return items.filter((x) => inside(x.at, range));
}

// ---------- הגדרות ----------

/** התחיל שיחה, טכנית: ענה לצ'אטבוט, עמודה I. n8n מסמן אותה ברגע שהלקוח שלח הודעה כלשהי (החלטת המנהל, #16). */
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
 * בנתונים עמודה K ריקה אצל רוב מי שסיים את השאלון, ולכן נחשב גם מי שעמודה L שלו started, finished או converted.
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
export const ACTIVE = 'לקוח פעיל';

/** "אופן שיחה" (עמודה BE): הסוכן כותב מכירתית או שירותית (החלטת המנהל, 20/10). איות ישן (מכירתי, שירותי) מאוחד. */
export const MODE_SALES = 'מכירתית';
export const MODE_SERVICE = 'שירותית';
export const UNSET = 'לא סווג';

export function normalizeMode(m: string | null): string | null {
  if (!m) return null;
  const t = m.replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  if (/^מכירת/.test(t)) return MODE_SALES;
  if (/^שירות/.test(t)) return MODE_SERVICE;
  return t;
}

export function salesConversation(l: Lead): boolean {
  return normalizeMode(l.mode) === MODE_SALES;
}

/**
 * רכישה של הבוט: בעמודה "של הבוט" בלשונית "רכישות" כתוב "כן" (החלטת המנהל, 29/10/2026).
 * את ההכרעה כותב הסוכן של המנהל בסריקת הלילה. הדשבורד לא מחשב אותה. כל ערך אחר, כולל ריק, הוא לא של הבוט.
 */
export function byBot(p: Purchase): boolean {
  return p.bot === 'yes';
}

/** עוד לא הוכרע: תא ריק, עמודה שלא קיימת, או רכישה שנלקחה משורת ליד. */
export function undecided(p: Purchase): boolean {
  return p.bot === null;
}

// ---------- מספרי מפתח ----------

export interface Summary {
  leads: number;
  startedJourney: number;
  /** כמה שיחות הסוכן כבר קרא */
  aiAnalyzed: number;
  /** מתוכן, שיחה אמיתית */
  realConversations: number;
  /** מתוכן, שיחה מכירתית */
  salesConversations: number;
  /** רכישות בטווח (לפי תאריך הרכישה) */
  purchases: number;
  /** קונים שונים בטווח */
  buyers: number;
  /** סך הכול שולם בטווח */
  totalPaid: number;
  /** עסקה ממוצעת: רק רכישות עם סכום (החלטת המנהל, 29/10) */
  avgDeal: number | null;
  /** לידים בטווח שרכשו אי פעם */
  leadsWhoBought: number;
}

export function summarize(leads: LeadX[], purchases: Purchase[]): Summary {
  const paid = purchases.filter((p) => (p.amount ?? 0) > 0);
  const total = paid.reduce((s, p) => s + p.amount!, 0);
  return {
    leads: leads.length,
    startedJourney: leads.filter(startedJourney).length,
    aiAnalyzed: leads.filter(aiAnalyzed).length,
    realConversations: leads.filter(realConversation).length,
    salesConversations: leads.filter(salesConversation).length,
    purchases: purchases.length,
    buyers: buyersOf(purchases),
    totalPaid: total,
    avgDeal: paid.length ? total / paid.length : null,
    leadsWhoBought: leads.filter((l) => l.purchases > 0).length,
  };
}

/** קונים שונים: לפי הליד, ורכישה בלי ליד נספרת כקונה בפני עצמה */
export function buyersOf(purchases: Purchase[]): number {
  const ids = new Set<number>();
  let orphans = 0;
  for (const p of purchases) {
    if (p.lead === null) orphans++;
    else ids.add(p.lead);
  }
  return ids.size + orphans;
}

/** משפך: ליד, שיחה, שאלון, רכישה */
export interface Funnel {
  leads: number;
  started: number;
  startedQ: number;
  finishedQ: number;
  bought: number;
}

export function funnel(leads: LeadX[]): Funnel {
  return {
    leads: leads.length,
    started: leads.filter(startedJourney).length,
    startedQ: leads.filter(startedQuestionnaire).length,
    finishedQ: leads.filter(finishedQuestionnaire).length,
    bought: leads.filter((l) => l.purchases > 0).length,
  };
}

/** כמה הסירו את עצמם, לפי תאריך ההסרה (ולא לפי תאריך הכניסה). */
export function removedIn(all: Lead[], range: Range): number {
  return all.filter((l) => l.removedAt && inside(l.removedAt, range)).length;
}

// ---------- מבחנים ----------

/** עשה מבחן: יש תוצאה (עבר או לא עבר), או שיש שם מבחן והסטטוס נדרס ל"לקוח פעיל" אחרי רכישה. */
export function didExam(l: Lead): boolean {
  return l.status === PASSED || l.status === FAILED || (l.test !== null && l.status === ACTIVE);
}

export interface ExamSummary {
  did: number;
  passed: number;
  failed: number;
  /** יש שם מבחן אבל התוצאה נדרסה על ידי "לקוח פעיל" */
  overwritten: number;
  passRate: number | null;
  /** עברו ורכשו אחר כך */
  passedAndBought: number;
}

export function examSummary(leads: LeadX[]): ExamSummary {
  const passed = leads.filter((l) => l.status === PASSED);
  const failed = leads.filter((l) => l.status === FAILED).length;
  const overwritten = leads.filter((l) => l.test !== null && l.status === ACTIVE).length;
  return {
    did: passed.length + failed + overwritten,
    passed: passed.length,
    failed,
    overwritten,
    passRate: passed.length + failed ? passed.length / (passed.length + failed) : null,
    passedAndBought: passed.filter((l) => l.purchases > 0).length,
  };
}

export interface PassFailRow {
  name: string;
  passed: number;
  failed: number;
  /** כולל מי שהתוצאה שלו נדרסה */
  total: number;
  passRate: number | null;
}

function passFailRows(leads: Lead[], keyOf: (l: Lead) => string | null, order?: string[]): PassFailRow[] {
  const m = new Map<string, PassFailRow>();
  for (const l of leads) {
    if (!didExam(l)) continue;
    const k = keyOf(l);
    if (!k) continue;
    const r = m.get(k) ?? { name: k, passed: 0, failed: 0, total: 0, passRate: null };
    r.total++;
    if (l.status === PASSED) r.passed++;
    if (l.status === FAILED) r.failed++;
    m.set(k, r);
  }
  const rows = [...m.values()].map((r) => ({ ...r, passRate: r.passed + r.failed ? r.passed / (r.passed + r.failed) : null }));
  if (order) return rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name) || b.total - a.total);
  return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** משפחת המבחן, לפי השם. */
export function testFamily(name: string): string {
  const n = name.toLowerCase();
  if (/one step assessment/.test(n)) return 'One Step Assessment';
  if (/one step access/.test(n)) return 'One Step Access';
  if (/one step funded/.test(n)) return 'One Step Funded';
  if (/express|instant/.test(n)) return 'Express / Instant';
  if (/freedom/.test(n)) return 'Freedom';
  if (/adventure/.test(n)) return 'Adventure';
  if (/lightning/.test(n)) return 'Lightning';
  if (/two step|2 step/.test(n)) return 'Two Step';
  if (/crypto/.test(n)) return 'Crypto';
  return 'אחר';
}

/** גודל החשבון, "100K" */
export function accountSize(name: string): string | null {
  const m = name.match(/(\d+)\s*k\b/i);
  return m ? `${m[1]}K` : null;
}

export function platformOf(name: string): string {
  if (/trade\s*r?locker/i.test(name)) return 'TradeLocker';
  if (/mt5/i.test(name)) return 'MT5';
  if (/bybit/i.test(name)) return 'Bybit';
  return 'לא צוין';
}

export function examsByFamily(leads: Lead[]): PassFailRow[] {
  return passFailRows(leads, (l) => (l.test ? testFamily(l.test) : null));
}

const SIZE_ORDER = ['2K', '5K', '10K', '20K', '50K', '100K', '200K', '500K'];
export function examsBySize(leads: Lead[]): PassFailRow[] {
  return passFailRows(leads, (l) => (l.test ? accountSize(l.test) : null), SIZE_ORDER).sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.name);
    const ib = SIZE_ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

export function examsByPlatform(leads: Lead[]): PassFailRow[] {
  return passFailRows(leads, (l) => (l.test ? platformOf(l.test) : null));
}

/** כל מבחן בנפרד */
export function testStats(leads: Lead[]): PassFailRow[] {
  return passFailRows(leads, (l) => l.test);
}

/** תוצאה: עבר או לא עבר, לפי תאריך הכניסה של הליד */
export function passFailOverTime(leads: Lead[], b: Bucket): { key: string; passed: number; failed: number }[] {
  return timeSeries(leads.filter(didExam), (l) => l.at, b, 2, (l) => [l.status === PASSED ? 1 : 0, l.status === FAILED ? 1 : 0])
    .map(({ key, values: [passed, failed] }) => ({ key, passed, failed }));
}

// ---------- רכישות ----------

export interface PurchaseSummary {
  purchases: number;
  buyers: number;
  /** קונים עם יותר מרכישה אחת */
  repeatBuyers: number;
  totalPaid: number;
  avgDeal: number | null;
  /** רכישות בלי סכום (נספרות, לא נסכמות) */
  noAmount: number;
  /** "של הבוט" = כן */
  bot: { purchases: number; paid: number };
  /** כל השאר: לא, ערך אחר, ועוד לא הוכרעו */
  other: { purchases: number; paid: number };
  /** מתוך other: עוד לא הוכרעו (ריק) */
  undecided: { purchases: number; paid: number };
}

export function purchaseSummary(purchases: Purchase[]): PurchaseSummary {
  const sum = (ps: Purchase[]) => ps.reduce((s, p) => s + (p.amount ?? 0), 0);
  const paid = purchases.filter((p) => (p.amount ?? 0) > 0);
  const bot = purchases.filter(byBot);
  const other = purchases.filter((p) => !byBot(p));
  const open = purchases.filter(undecided);
  const perLead = new Map<number, number>();
  for (const p of purchases) if (p.lead !== null) perLead.set(p.lead, (perLead.get(p.lead) ?? 0) + 1);
  return {
    purchases: purchases.length,
    buyers: buyersOf(purchases),
    repeatBuyers: [...perLead.values()].filter((n) => n > 1).length,
    totalPaid: sum(paid),
    avgDeal: paid.length ? sum(paid) / paid.length : null,
    noAmount: purchases.length - paid.length,
    bot: { purchases: bot.length, paid: sum(bot) },
    other: { purchases: other.length, paid: sum(other) },
    undecided: { purchases: open.length, paid: sum(open) },
  };
}

export const NO_PRODUCT = 'לא צוין';

/** משפחת המוצר, לפי השם. */
export function productFamily(name: string | null): string {
  if (!name) return NO_PRODUCT;
  const n = name.toLowerCase();
  if (/activation fee/.test(n)) return 'דמי הפעלה (activation fee)';
  if (/lightning pro/.test(n)) return 'Lightning Pro';
  if (/lightning access/.test(n)) return 'Lightning Access';
  if (/lightning/.test(n)) return 'Lightning challenge';
  if (/one step assessment/.test(n)) return 'One Step Assessment';
  if (/one step access/.test(n)) return 'One Step Access';
  if (/one step funded/.test(n)) return 'One Step Funded';
  if (/express|instant/.test(n)) return 'Instant / Express';
  if (/freedom/.test(n)) return 'Freedom';
  if (/adventure/.test(n)) return 'Adventure';
  if (/two step|2 step/.test(n)) return 'Two Step';
  if (/crypto/.test(n)) return 'Crypto';
  if (/challenge/.test(n)) return 'Challenge';
  return 'אחר';
}

export interface ProductStat {
  name: string;
  count: number;
  revenue: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** מתוכן של הבוט */
  bot: number;
}

export function productStats(ps: Purchase[], nameOf: (p: Purchase) => string = (p) => p.product ?? NO_PRODUCT): ProductStat[] {
  const by = new Map<string, { amounts: number[]; count: number; bot: number }>();
  for (const p of ps) {
    const n = nameOf(p);
    const s = by.get(n) ?? { amounts: [], count: 0, bot: 0 };
    s.count++;
    if (byBot(p)) s.bot++;
    if (p.amount && p.amount > 0) s.amounts.push(p.amount);
    by.set(n, s);
  }
  return [...by.entries()]
    .map(([name, s]) => {
      const revenue = s.amounts.reduce((x, y) => x + y, 0);
      return {
        name, count: s.count, revenue, bot: s.bot,
        avg: s.amounts.length ? revenue / s.amounts.length : null,
        min: s.amounts.length ? Math.min(...s.amounts) : null,
        max: s.amounts.length ? Math.max(...s.amounts) : null,
      };
    })
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}

/** רכישות לפי מקור ה-utm של הרכישה עצמה */
export function purchaseSources(ps: Purchase[]): ProductStat[] {
  return productStats(ps, (p) => p.sourceGroup ?? (p.fromLead ? 'מלשונית הלידים' : NO_PRODUCT));
}

export function campaigns(ps: Purchase[]): ProductStat[] {
  return productStats(ps.filter((p) => p.campaign), (p) => p.campaign!);
}

// ---------- מקור הגעה ----------

export interface SourceRow {
  name: string;
  leads: number;
  started: number;
  bought: number;
  spent: number;
}

export function sourceRows(leads: LeadX[], keyOf: (l: Lead) => string | null = (l) => l.sourceGroup): SourceRow[] {
  const m = new Map<string, SourceRow>();
  for (const l of leads) {
    const k = keyOf(l) ?? NO_PRODUCT;
    const r = m.get(k) ?? { name: k, leads: 0, started: 0, bought: 0, spent: 0 };
    r.leads++;
    if (startedJourney(l)) r.started++;
    if (l.purchases > 0) r.bought++;
    r.spent += l.spent;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
}

// ---------- זמן ----------

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
export function autoBucket(items: { at: string }[]): Bucket {
  if (!items.length) return 'day';
  const days = items.map((l) => dayKey(l.at)).sort();
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

/** ספירה לפי ערך, מהנפוץ לנדיר. */
export function countBy<T>(items: T[], key: (x: T) => string | null): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of items) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
