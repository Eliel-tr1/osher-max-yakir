/**
 * הסינון של כל הדף לפי מקור הגעה ותהליך (#38). במקום אחד, כדי שהמשמעות של keep תהיה אחידה:
 * keep = null בלי סינון (הכול נספר, גם שורות בלי ליד), וקבוצת הלידים שנשארו כשיש סינון.
 */
import type { Purchase } from './leads/types';
import { inRange, type LeadX, type Range } from './metrics';

/** "הכול" בבחירת מקור ותהליך */
export const ALL: string = '';

export interface Filter<T> {
  /** הלידים שנשארו אחרי הסינון (בלי טווח) */
  scoped: T[];
  /** null = בלי סינון. אחרת המיקומים של הלידים שנשארו */
  keep: Set<number> | null;
  /** יש סינון פעיל לפי מקור או תהליך */
  active: boolean;
}

export function leadFilter<T extends Pick<LeadX, 'i' | 'sourceGroup' | 'process'>>(leads: T[], source: string, proc: string): Filter<T> {
  const active = source !== ALL || proc !== ALL;
  if (!active) return { scoped: leads, keep: null, active };
  const scoped = leads.filter((l) => (source === ALL || l.sourceGroup === source) && (proc === ALL || l.process === proc));
  return { scoped, keep: new Set(scoped.map((l) => l.i)), active };
}

/** רכישות לפי תאריך הרכישה. כשיש סינון, רק הרכישות של הלידים שנשארו */
export function purchasesIn(purchases: Purchase[], range: Range, keep: Set<number> | null): Purchase[] {
  return inRange(purchases, range).filter((p) => keep === null || (p.lead !== null && keep.has(p.lead)));
}
