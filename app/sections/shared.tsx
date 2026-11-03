'use client';

import { SIDE_LABEL, type BotSide, type Bucket } from '@/lib/metrics';
import { fmtDay, fmtMonthShort, type Series } from '../charts';

/** הצבעים של "של הבוט" מול השאר, אחידים בכל הדף (הנחיית המנהל, 1/11/2026) */
export const SIDE: Record<BotSide, { color: string; hatch?: boolean }> = {
  yes: { color: '--bot' },
  no: { color: '--notbot' },
  open: { color: '--open-b', hatch: true },
};
export const SIDE_SERIES: Series[] = (['yes', 'no', 'open'] as BotSide[]).map((k) => ({ key: k, label: SIDE_LABEL[k], ...SIDE[k] }));

/** שם קצר לצ'יפ של סיבה (הקופון האישי, גם של איש קשר אחר, הוא צ'יפ אחד) */
export function shortReason(name: string): string {
  if (name.startsWith('קופון הבוט')) return 'קופון הבוט';
  const m: Record<string, string> = {
    'שיחה מכירתית לפני הרכישה': 'שיחה מכירתית',
    'הבוט שלח קישור לאתר': 'קישור לאתר',
    'קישור הבוט (vitrue)': 'קישור vitrue',
    'הבוט שלח קופון או קישור רכישה': 'קופון או קישור רכישה',
    'רכישה עד 72 שעות אחרי דיוור הבוט': 'אחרי דיוור',
    'שיחה קצרה בלי קישור מהבוט': 'שיחה קצרה',
    'שיחה שירותית בלי קישור מהבוט': 'שיחה שירותית',
  };
  return m[name] ?? name;
}

export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'day', label: 'יום' },
  { id: 'week', label: 'שבוע' },
  { id: 'month', label: 'חודש' },
];

export function fmtBucket(key: string, b: Bucket): string {
  return b === 'month' ? fmtMonthShort(key) : fmtDay(key);
}

/** בחירת יחידת זמן. null = אוטומטי לפי הטווח */
export function BucketChips({ value, auto, onChange, only }: { value: Bucket | null; auto: Bucket; onChange: (b: Bucket | null) => void; only?: Bucket[] }) {
  const current = value ?? auto;
  return (
    <div className="chips small" role="group" aria-label="לפי">
      {BUCKETS.filter((b) => !only || only.includes(b.id)).map((b) => (
        <button key={b.id} type="button" className={current === b.id ? 'on' : ''} aria-pressed={current === b.id} onClick={() => onChange(b.id === auto ? null : b.id)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips small" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'on' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
