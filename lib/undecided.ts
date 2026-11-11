/**
 * "עוד לא הוכרעו" (#38, בקשת המנהל 10/11/2026): הרכישות מלשונית "רכישות" שהעמודה "של הבוט" שלהן ריקה.
 * רכישה שנלקחה משורת ליד אין לה תא "של הבוט", ולכן אי אפשר להכריע אותה: היא נספרת בנפרד ולא נכנסת לרשימה.
 * יחד הן "עוד לא הוכרעו" של כל הדף (botBreakdown(...).open).
 */
import type { Purchase } from './leads/types';
import { buyersOf, undecided } from './metrics';

/** "סיבה" ריקה ברכישה שעוד לא הוכרעה */
export const NO_REASON_YET = 'בלי סיבה כתובה';

export function undecidedReason(p: Pick<Purchase, 'reason'>): string {
  return p.reason ?? NO_REASON_YET;
}

export interface Money {
  purchases: number;
  /** רק סכומים חיוביים, כמו בכל הדף */
  paid: number;
}

export interface UndecidedReason extends Money {
  name: string;
}

export interface UndecidedView {
  /** רכישות מלשונית "רכישות" שעוד לא הוכרעו, מהחדשה לישנה */
  rows: Purchase[];
  tab: Money & { buyers: number };
  /** רכישות משורת ליד: עוד לא הוכרעו, ואין איך להכריע אותן */
  fromLead: Money;
  /** הכול יחד: אותו מספר כמו "עוד לא הוכרעו" בשאר הדף */
  total: Money;
  /** לפי "סיבה", מהגדולה לקטנה. הסכום = tab */
  reasons: UndecidedReason[];
}

function money(ps: Purchase[]): Money {
  return { purchases: ps.length, paid: ps.reduce((s, p) => s + (p.amount && p.amount > 0 ? p.amount : 0), 0) };
}

/** ps: הרכישות אחרי הטווח והסינון של הדף */
export function undecidedView(ps: Purchase[]): UndecidedView {
  const open = ps.filter(undecided);
  const rows = open.filter((p) => !p.fromLead).sort((a, b) => b.at.localeCompare(a.at));
  const lead = open.filter((p) => p.fromLead);
  const groups = new Map<string, Purchase[]>();
  for (const p of rows) {
    const k = undecidedReason(p);
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  const reasons = [...groups.entries()]
    .map(([name, g]) => ({ name, ...money(g) }))
    .sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
  return { rows, tab: { ...money(rows), buyers: buyersOf(rows) }, fromLead: money(lead), total: money(open), reasons };
}

/** הרשימה אחרי צ'יפ של סיבה. null = כל הסיבות */
export function undecidedRows(v: UndecidedView, reason: string | null): Purchase[] {
  return reason === null ? v.rows : v.rows.filter((p) => undecidedReason(p) === reason);
}
