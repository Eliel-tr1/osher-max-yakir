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

/** התחיל את המסע (התחלת שיחה): ענה לצ'אטבוט, עמודה I (#16, לאישור המנהל). */
export function startedJourney(l: Lead): boolean {
  return l.answered;
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

/** ערכי "אופן שיחה" בסדר קבוע. ערך אחר שיופיע בטבלה יתווסף בסוף. */
export const MODES = ['שירות', 'מכירותי', 'גם וגם', 'אין שיחה'];
export const UNSET = 'לא סווג';

export interface BreakdownRow {
  name: string;
  leads: number;
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
  const extra = [...new Set(leads.map((l) => l.mode).filter((m): m is string => !!m && !MODES.includes(m)))].sort();
  const modes = [...MODES, ...extra, UNSET];
  const empty = (name: string): BreakdownRow => ({
    name, leads: 0, startedQ: 0, finishedQ: 0, purchased: 0, paidBot: 0, paidOther: 0, totalPaid: 0, passed: 0, failed: 0,
    byMode: modes.map(() => 0),
  });
  const add = (r: BreakdownRow, l: Lead) => {
    r.leads++;
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
    r.byMode[modes.indexOf(l.mode && modes.includes(l.mode) ? l.mode : UNSET)]++;
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

/** עברו ונכשלו לאורך זמן: לפי יום, או לפי חודש כשהטווח ארוך. */
export function passFailOverTime(leads: Lead[], by: 'day' | 'month'): { key: string; passed: number; failed: number }[] {
  const keyOf = by === 'day' ? (l: Lead) => dayKey(l.at) : (l: Lead) => monthKey(l.at);
  const keys = by === 'day' ? perDay(leads).map((d) => d.day) : [...new Set(leads.map(keyOf))].sort();
  const m = new Map(keys.map((k) => [k, { key: k, passed: 0, failed: 0 }]));
  for (const l of leads) {
    const r = m.get(keyOf(l));
    if (!r) continue;
    if (l.status === PASSED) r.passed++;
    if (l.status === FAILED) r.failed++;
  }
  return [...m.values()];
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
