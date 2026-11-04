'use client';

import { useMemo, useState } from 'react';
import type { Purchase } from '@/lib/leads/types';
import { autoBucket, botSeries, bucketOf, moneyShareSeries, type Bucket } from '@/lib/metrics';
import { Columns, fmtDay, Info, money, pctOf } from '../charts';
import { BucketChips, fmtBucket, SIDE_SERIES } from './shared';

/**
 * "לאורך זמן" (עיצוב א4, #34): עמודות מוערמות של € (הבוט, השאר ועוד לא הוכרע), וקו של החלק של הבוט על ציר משני.
 * לחיצה על עמודה מציגה את המספרים שלה מעל הגרף, והחיצים עוברים תקופה: בטלפון העמודות צרות ללחיצה מדויקת.
 * ימים בלי שורות בגיליון מסומנים "אין נתונים" ולא 0.
 */
export function OverTime({ all, missingDays, by, setBy }: { all: Purchase[]; missingDays: string[]; by: Bucket | null; setBy: (b: Bucket | null) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const v = useMemo(() => {
    const auto: Bucket = autoBucket(all) === 'day' && all.length > 0 && spanDays(all) > 21 ? 'week' : autoBucket(all);
    const b = by ?? auto;
    const series = botSeries(all, b, 'money');
    const share = new Map(moneyShareSeries(all, b).map((x) => [x.key, x.share]));
    // יום בלי אף שורה בלשונית הרכישות (למשל 3/10 ו-17/10): "אין נתונים", לא 0
    const missing = new Map<string, string[]>();
    for (const d of missingDays) {
      const k = bucketOf(`${d}T12:00:00.000Z`, b);
      missing.set(k, [...(missing.get(k) ?? []), d]);
    }
    return {
      auto, b, series,
      share: series.map((d) => share.get(d.key) ?? null),
      gaps: series.map((d) => {
        const days = missing.get(d.key);
        return days ? { full: b === 'day', text: `אין נתונים ל-${days.map(fmtDay).join(', ')}` } : null;
      }),
    };
  }, [all, missingDays, by]);
  const n = v.series.length;
  // בלי בחירה, או אחרי שינוי טווח שקיצר את הסדרה: התקופה האחרונה
  const i = pick === null || pick >= n ? n - 1 : pick;
  const cur = n ? v.series[i] : null;
  const curLabel = cur ? fmtBucket(cur.key, v.b) : '';
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
      {cur ? (
        <div className="readout" dir="ltr">
          {/* הזמן זורם משמאל לימין כמו העמודות: החץ השמאלי לתקופה מוקדמת יותר */}
          <button type="button" className="readnav" onClick={() => setPick(Math.max(0, i - 1))} disabled={i === 0} aria-label="תקופה קודמת">‹</button>
          <p dir="rtl" aria-live="polite">
            <b className="readtitle">{v.b === 'week' ? `השבוע של ${curLabel}` : curLabel}</b>
            <span>של הבוט <b className="isbot">{money.format(cur.values[0])}</b></span>
            <span>לא של הבוט <b>{money.format(cur.values[1])}</b></span>
            <span>עוד לא הוכרע <b>{money.format(cur.values[2])}</b></span>
            <span>החלק של הבוט <b>{pctOf(v.share[i])}</b></span>
          </p>
          <button type="button" className="readnav" onClick={() => setPick(Math.min(n - 1, i + 1))} disabled={i === n - 1} aria-label="תקופה הבאה">›</button>
        </div>
      ) : null}
      <Columns
        labels={v.series.map((d) => fmtBucket(d.key, v.b))}
        values={v.series.map((d) => d.values)}
        series={SIDE_SERIES}
        isMoney
        height={210}
        line={{ values: v.share, label: 'החלק של הבוט', color: '--ink-2' }}
        gaps={v.gaps}
        picked={i}
        onPick={setPick}
      />
    </section>
  );
}

function spanDays(ps: { at: string }[]): number {
  const ts = ps.map((p) => new Date(p.at).getTime());
  return (Math.max(...ts) - Math.min(...ts)) / 86_400_000;
}
