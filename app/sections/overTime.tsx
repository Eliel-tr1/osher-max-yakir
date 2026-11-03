'use client';

import { useMemo } from 'react';
import type { Purchase } from '@/lib/leads/types';
import { autoBucket, botSeries, bucketOf, moneyShareSeries, type Bucket } from '@/lib/metrics';
import { Columns, Info } from '../charts';
import { BucketChips, fmtBucket, SIDE_SERIES } from './shared';

/**
 * "לאורך זמן" (הנחיית המנהל 3/11/2026, #27): גרף אחד. עמודות מוערמות של € (הבוט, השאר ועוד לא הוכרע), וקו של החלק של
 * הבוט על ציר משני. ימים בלי שורות בגיליון מסומנים "אין נתונים" ולא 0.
 */
export function OverTime({ all, missingDays, by, setBy }: { all: Purchase[]; missingDays: string[]; by: Bucket | null; setBy: (b: Bucket | null) => void }) {
  const v = useMemo(() => {
    const auto: Bucket = autoBucket(all) === 'day' && all.length > 0 && spanDays(all) > 21 ? 'week' : autoBucket(all);
    const b = by ?? auto;
    const series = botSeries(all, b, 'money');
    const share = new Map(moneyShareSeries(all, b).map((x) => [x.key, x.share]));
    const missing = new Map<string, number>();
    for (const d of missingDays) missing.set(bucketOf(`${d}T12:00:00.000Z`, b), (missing.get(bucketOf(`${d}T12:00:00.000Z`, b)) ?? 0) + 1);
    return {
      auto, b, series,
      share: series.map((d) => share.get(d.key) ?? null),
      gaps: series.map((d) => (missing.has(d.key) ? (b === 'day' ? 'full' : 'part') : null) as 'full' | 'part' | null),
    };
  }, [all, missingDays, by]);
  return (
    <section className="card" id="time" aria-labelledby="time-h">
      <div className="cardhead">
        <h2 id="time-h">
          לאורך זמן{' '}
          <Info>
            € לפי תקופה: של הבוט, לא של הבוט, ועוד לא הוכרעו. הקו הוא החלק של הבוט מכל ההכנסות בתקופה, לפי הציר מימין. ימים שאין להם אף שורה בלשונית הרכישות
            (פער בנתונים) מסומנים &quot;אין נתונים&quot;.
          </Info>
        </h2>
        <BucketChips value={by} auto={v.auto} onChange={setBy} />
      </div>
      <Columns
        labels={v.series.map((d) => fmtBucket(d.key, v.b))}
        values={v.series.map((d) => d.values)}
        series={SIDE_SERIES}
        isMoney
        height={190}
        line={{ values: v.share, label: 'החלק של הבוט', color: '--ink-2' }}
        gaps={v.gaps}
      />
    </section>
  );
}

function spanDays(ps: { at: string }[]): number {
  const ts = ps.map((p) => new Date(p.at).getTime());
  return (Math.max(...ts) - Math.min(...ts)) / 86_400_000;
}
