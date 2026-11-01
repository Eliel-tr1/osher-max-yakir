'use client';

import type { Bucket } from '@/lib/metrics';
import { fmtDay, fmtMonthShort } from '../charts';

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
