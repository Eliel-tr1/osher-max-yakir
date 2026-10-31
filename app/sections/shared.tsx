'use client';

import type { BotSide } from '@/lib/metrics';
import { SIDE_LABEL } from '@/lib/metrics';
import type { Bucket } from '@/lib/metrics';
import { fmtDay, fmtMonthShort } from '../charts';

/** צבע לכל צד של "של הבוט". נבדקו יחד בבודק הפלטה (31/10/2026) */
export const SIDE_COLOR: Record<BotSide, string> = { yes: '--series-1', no: '--series-2', open: '--series-3' };
export const SIDE_SERIES = (['yes', 'no', 'open'] as BotSide[]).map((k) => ({ key: k, label: SIDE_LABEL[k], color: SIDE_COLOR[k] }));

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

/** שם עם ריבוע צבע לפניו */
export function Keyed({ color, children }: { color?: string; children: string }) {
  return <span className="keyed">{color ? <i className="key" style={{ background: `var(${color})` }} /> : null}{children}</span>;
}
