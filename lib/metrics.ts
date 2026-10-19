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

/**
 * שילם לא דרך הבוט: יש סכום, ואין converted.
 * לבירור (#12): רוב השורות האלה בסטטוס payment, ולא ידוע אם payment הוא תשלום בפועל.
 */
export function paidOther(l: Lead): boolean {
  return !paidByBot(l) && (l.amount ?? 0) > 0;
}

/** שם המוצר של רכישה: "מוצר שנקנה", ואם ריק אז "מבחן" (לבירור, #12). */
export function productOf(l: Lead): string {
  return l.product ?? l.test ?? 'לא צוין';
}

export interface Summary {
  leads: number;
  paidBot: number;
  paidOther: number;
  revenueBot: number;
  revenueOther: number;
  /** ממוצע סכום לעסקה דרך הבוט, null כשאין */
  avgDealBot: number | null;
  /** ממוצע סכום לכל העסקאות, null כשאין */
  avgDealAll: number | null;
}

export function summarize(leads: Lead[]): Summary {
  const bot = leads.filter(paidByBot);
  const other = leads.filter(paidOther);
  const sum = (xs: Lead[]) => xs.reduce((s, l) => s + (l.amount ?? 0), 0);
  const withAmount = (xs: Lead[]) => xs.filter((l) => (l.amount ?? 0) > 0);
  const botPaidAmounts = withAmount(bot);
  const all = [...botPaidAmounts, ...other];
  return {
    leads: leads.length,
    paidBot: bot.length,
    paidOther: other.length,
    revenueBot: sum(bot),
    revenueOther: sum(other),
    avgDealBot: botPaidAmounts.length ? sum(botPaidAmounts) / botPaidAmounts.length : null,
    avgDealAll: all.length ? sum(all) / all.length : null,
  };
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
    .filter((l) => paidByBot(l) || paidOther(l))
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
