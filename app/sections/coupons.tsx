'use client';

import { useMemo, useState } from 'react';
import type { Lead, Purchase } from '@/lib/leads/types';
import { autoBucket, BOT_COUPON_GROUP, botCoupons, botCouponSeries, buyItems, couponRows, SPOOKY, type Bucket, type Range } from '@/lib/metrics';
import { BarTable, Columns, Fold, LazyFold, Legend, Stats, money, nf, pct } from '../charts';
import { BuyList, listMeta } from '../lists';
import { BucketChips, Chips, fmtBucket } from './shared';

const BOT_COLOR = '--series-1';
const REST_COLOR = '--series-2';

/** שם הקוד לתצוגה, עם הסבר קצר לקופונים המוכרים */
function CodeName({ name }: { name: string }) {
  if (name === SPOOKY) return <>{name}<small>קופון האתר להאלווין</small></>;
  if (name === BOT_COUPON_GROUP) return <>{name}<small>PTB- ו-10 תווים, הקודים לא מוצגים</small></>;
  return <>{name}</>;
}

/** סקשן הקופונים (הנחיית המנהל, 31/10/2026) */
export function CouponsSection({ people, leads, all, range, rangeKey }: {
  /** הלידים אחרי סינון המקור והתהליך, להפקת הקופונים */
  people: Lead[];
  /** כל הלידים בקובץ, כדי למצוא את הקמפיין של רכישה */
  leads: Lead[];
  all: Purchase[];
  range: Range;
  rangeKey: string;
}) {
  const [sort, setSort] = useState<'count' | 'money'>('count');
  const [by, setBy] = useState<Bucket | null>(null);
  const [lastKey, setLastKey] = useState(rangeKey);
  if (lastKey !== rangeKey) {
    // טווח חדש: יחידת הזמן חוזרת לאוטומטי
    setLastKey(rangeKey);
    setBy(null);
  }
  const v = useMemo(() => {
    const made = people.filter((l) => l.botCoupon && l.couponAt).map((l) => ({ at: l.couponAt! }));
    const auto = autoBucket(made);
    const b = by ?? auto;
    const groups = new Map<string, Purchase[]>();
    for (const p of all) {
      if (!p.coupon) continue;
      const g = groups.get(p.coupon);
      if (g) g.push(p);
      else groups.set(p.coupon, [p]);
    }
    return {
      auto, b,
      bc: botCoupons(people, all, range),
      series: botCouponSeries(people, range, b),
      rows: couponRows(all, sort),
      groups,
      none: all.filter((p) => !p.coupon).length,
    };
  }, [people, all, range, by, sort]);
  const withCoupon = all.length - v.none;

  return (
    <section className="card" aria-labelledby="coupons-h">
      <div className="cardhead">
        <h2 id="coupons-h">קופונים</h2>
      </div>

      <h3>הקופון האישי של הבוט</h3>
      <Stats items={[
        { label: 'הופקו', value: nf.format(v.bc.made), sub: 'לפי תאריך הקופון. זה מינימום' },
        { label: 'שומשו', value: nf.format(v.bc.used), sub: money.format(v.bc.usedPaid) },
        { label: 'יחס שימוש', value: pct(v.bc.used, v.bc.made), sub: 'שימושים לחלק להפקות' },
      ]} />
      <div className="cardhead">
        <p className="hint tight">קופונים שהבוט הפיק, לפי {v.b === 'day' ? 'יום' : v.b === 'week' ? 'שבוע' : 'חודש'}</p>
        <BucketChips value={by} auto={v.auto} onChange={setBy} />
      </div>
      <Columns labels={v.series.map((d) => fmtBucket(d.key, v.b))} values={v.series.map((d) => d.values)} series={[{ key: 'made', label: 'הופקו', color: BOT_COLOR }]} />
      <p className="hint">
        העמודה &quot;קופון הבוט&quot; שומרת רק את הקופון האחרון של כל אדם, ולכן מספר ההפקות הוא מינימום. שימוש = רכישה שהסיבה שלה מתחילה ב&quot;קופון הבוט&quot;.
        {v.bc.undated ? ` ל-${nf.format(v.bc.undated)} אנשים יש קופון בלי תאריך: הם נספרים רק כשמוצגים כל התאריכים.` : ''}
      </p>

      <div className="box">
        <div className="cardhead">
          <h3>כל הקודים ברכישות</h3>
          <Chips value={sort} onChange={setSort} label="סדר" options={[{ id: 'count', label: 'לפי כמות' }, { id: 'money', label: 'לפי סכום' }]} />
        </div>
        <Stats items={[
          { label: 'רכישות עם קופון', value: nf.format(withCoupon), sub: `${pct(withCoupon, all.length)} מהרכישות` },
          { label: 'בלי קופון', value: nf.format(v.none) },
          { label: 'קודים שונים', value: nf.format(v.rows.length) },
        ]} />
        {sort === 'count'
          ? <Legend items={[{ label: 'רכישות של הבוט', color: BOT_COLOR }, { label: 'שאר הרכישות (לא, או עוד לא הוכרע)', color: REST_COLOR }]} />
          : <Legend items={[{ label: 'סכום', color: BOT_COLOR }]} />}
        <BarTable
          headers={['קוד', '', 'רכישות', 'סכום', 'של הבוט']}
          rows={v.rows.map((r) => ({
            key: r.name,
            name: <CodeName name={r.name} />,
            title: r.name,
            segments: sort === 'count'
              ? [{ value: r.bot, color: BOT_COLOR, label: 'של הבוט' }, { value: r.purchases - r.bot, color: REST_COLOR, label: 'שאר הרכישות' }]
              : [{ value: Math.round(r.paid), color: BOT_COLOR, label: 'סכום' }],
            cells: [nf.format(r.purchases), money.format(r.paid), `${nf.format(r.bot)} (${pct(r.bot, r.purchases)})`],
          }))}
        />
        <p className="hint tight">הקוד נקרא מ&quot;קופון מהרכישה&quot;, באותיות גדולות. ריק, &quot;-&quot; ו-empty הם רכישה בלי קופון.</p>
        <Fold title="רשימות לפי קוד" count={v.rows.length}>
          {v.rows.map((r) => {
            const g = v.groups.get(r.name) ?? [];
            return (
              <LazyFold key={r.name} title={r.name} meta={listMeta(g)}>
                {() => <BuyList items={buyItems(g, leads)} />}
              </LazyFold>
            );
          })}
        </Fold>
      </div>
    </section>
  );
}
