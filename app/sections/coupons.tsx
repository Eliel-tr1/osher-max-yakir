'use client';

import { useMemo, useState } from 'react';
import type { Lead, Purchase } from '@/lib/leads/types';
import { autoBucket, BOT_COUPON_GROUP, botCoupons, botCouponSeries, couponRows, SPOOKY, type Bucket, type Range } from '@/lib/metrics';
import { Bars100, BarTable, Columns, Info, Legend, ListBlock, Stats, money, nf, pct } from '../charts';
import { useLinkNote } from '../auth';
import { BuyList, buysCount, buysSum } from '../lists';
import { SIDE } from './botVsRest';
import { BucketChips, Chips, fmtBucket } from './shared';

/** שם הקוד לתצוגה, עם הסבר קצר לקופונים המוכרים */
function CodeName({ name }: { name: string }) {
  if (name === SPOOKY) return <>{name}<small>קופון האתר להאלווין</small></>;
  if (name === BOT_COUPON_GROUP) return <>{name}<small>הקודים עצמם לא מוצגים</small></>;
  return <>{name}</>;
}

/** סקשן הקופונים (הנחיית המנהל, 31/10 ו-1/11/2026) */
export function CouponsSection({ people, all, range, rangeKey }: {
  /** הלידים אחרי סינון המקור והתהליך, להפקת הקופונים */
  people: Lead[];
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
  const note = useLinkNote();
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
    <section className="card" id="coupons" aria-labelledby="coupons-h">
      <h2 id="coupons-h">קופונים</h2>

      <h3>הקופון האישי של הבוט</h3>
      <Stats items={[
        {
          label: 'הופקו', value: nf.format(v.bc.made),
          sub: v.bc.undated ? `ועוד ${nf.format(v.bc.undated)} בלי תאריך` : undefined,
        },
        { label: 'שומשו', value: `${nf.format(v.bc.used)} רכישות`, sub: money.format(v.bc.usedPaid) },
        { label: 'יחס שימוש', value: pct(v.bc.used, v.bc.made), ring: v.bc.made ? v.bc.used / v.bc.made : null },
      ]} />
      <p className="hint tight">
        הפקות לפי {v.b === 'day' ? 'יום' : v.b === 'week' ? 'שבוע' : 'חודש'}{' '}
        <Info>
          הופקו: אנשים שבעמודה &quot;קופון הבוט&quot; שלהם יש קוד, לפי &quot;תאריך קופון&quot;. העמודה שומרת רק את הקופון האחרון של כל אדם, ולכן זה מינימום. שומשו: רכישות
          שבהן &quot;קופון מהרכישה&quot; הוא קוד אישי של הבוט (PTB- ו-10 תווים), גם כשהסיבה שנרשמה לרכישה אחרת. זו אותה ספירה כמו בשורה &quot;{BOT_COUPON_GROUP}&quot; בטבלת הקודים.
        </Info>
      </p>
      <div className="cardhead"><span /><BucketChips value={by} auto={v.auto} onChange={setBy} /></div>
      <Columns labels={v.series.map((d) => fmtBucket(d.key, v.b))} values={v.series.map((d) => d.values)} series={[{ key: 'made', label: 'הופקו', color: '--bot' }]} />

      <div className="box">
        <div className="cardhead">
          <h3>
            כל הקודים ברכישות{' '}
            <Info>הקוד נקרא מ&quot;קופון מהרכישה&quot;, באותיות גדולות. ריק, &quot;-&quot; ו-empty הם רכישה בלי קופון. קוד אישי של הבוט מקובץ לשורה אחת, בלי להציג את הקודים.</Info>
          </h3>
          <Chips value={sort} onChange={setSort} label="סדר" options={[{ id: 'count', label: 'לפי כמות' }, { id: 'money', label: 'לפי סכום' }]} />
        </div>
        <Bars100
          label="רכישות"
          parts={[
            { value: withCoupon, color: '--bot', text: nf.format(withCoupon), more: 'עם קופון' },
            { value: v.none, color: '--notbot', text: nf.format(v.none), more: 'בלי קופון' },
          ]}
        />
        <p className="hint tight">{nf.format(v.rows.length)} קודים שונים</p>
        {sort === 'count'
          ? <Legend items={[{ label: 'רכישות של הבוט', color: SIDE.yes.color }, { label: 'שאר הרכישות', color: SIDE.no.color }]} />
          : <Legend items={[{ label: 'סכום', color: SIDE.yes.color }]} />}
        <BarTable
          headers={['קוד', '', 'רכישות', 'סכום', 'של הבוט']}
          rows={v.rows.map((r) => ({
            key: r.name,
            name: <CodeName name={r.name} />,
            title: r.name,
            segments: sort === 'count'
              ? [{ value: r.bot, color: SIDE.yes.color, label: 'של הבוט' }, { value: r.purchases - r.bot, color: SIDE.no.color, label: 'שאר הרכישות' }]
              : [{ value: Math.round(r.paid), color: SIDE.yes.color, label: 'סכום' }],
            cells: [nf.format(r.purchases), money.format(r.paid), `${nf.format(r.bot)} (${pct(r.bot, r.purchases)})`],
          }))}
        />
      </div>

      <ListBlock
        note={note}
        items={v.rows.map((r) => {
          const g = v.groups.get(r.name) ?? [];
          return { id: `c-${r.name}`, title: r.name, count: buysCount(g), sum: buysSum(g), render: () => <BuyList purchases={g} /> };
        })}
      />
    </section>
  );
}
