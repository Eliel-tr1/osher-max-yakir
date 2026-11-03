'use client';

import { useMemo, useState } from 'react';
import type { Lead, Purchase } from '@/lib/leads/types';
import { afterBotCoupon, autoBucket, BOT_COUPON_GROUP, botCoupons, COUPON_RECORDED_FROM, botCouponSeries, couponRows, SPOOKY, type Bucket, type Range } from '@/lib/metrics';
import { BarList, Bars100, BarTable, Columns, fmtDay, Fold, Info, Legend, ListBlock, Stats, money, nf, pct } from '../charts';
import { useLinkNote } from '../auth';
import { BuyList, buysCount, buysSum } from '../lists';
import { SIDE } from './shared';
import { BucketChips, Chips, fmtBucket } from './shared';

/** שם הקוד לתצוגה, עם הסבר קצר לקופונים המוכרים */
function CodeName({ name }: { name: string }) {
  if (name === SPOOKY) return <>{name}<small>קופון האתר להאלווין</small></>;
  if (name === BOT_COUPON_GROUP) return <>{name}<small>הקודים עצמם לא מוצגים</small></>;
  return <>{name}</>;
}

/** כמה קודים מוצגים בטבלה לפני "להציג את כל ה-N" (הנחיית המנהל 3/11/2026) */
const TOP_CODES = 5;

/** סקשן הקופונים (הנחיית המנהל, 31/10, 1/11 ו-3/11/2026). סגור כברירת מחדל */
export function CouponsSection({ people, all, ever, range, rangeKey, open, onToggle }: {
  /** הלידים אחרי סינון המקור והתהליך, להפקת הקופונים */
  people: Lead[];
  all: Purchase[];
  /** כל הרכישות בלי טווח תאריכים: רכישה אחרי קופון נספרת גם כשהיא אחרי סוף הטווח */
  ever: Purchase[];
  range: Range;
  rangeKey: string;
  open: boolean;
  onToggle: () => void;
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
    return {
      auto, b,
      bc: botCoupons(people, all, range),
      after: afterBotCoupon(people, ever, range),
      series: botCouponSeries(people, range, b),
      rows: couponRows(all, sort),
      none: all.filter((p) => !p.coupon).length,
    };
  }, [people, all, ever, range, by, sort]);
  const withCoupon = all.length - v.none;

  return (
    <Fold
      id="coupons" title="קופונים" open={open} onToggle={onToggle}
      stats={[
        { label: 'הופקו', value: nf.format(v.bc.made) },
        { label: 'שומשו', value: nf.format(v.bc.used) },
        { label: 'יחס שימוש', value: pct(v.bc.used, v.bc.made) },
      ]}
    >
      <h3>הקופון האישי של הבוט</h3>
      <Stats items={[
        {
          label: 'הופקו', value: nf.format(v.bc.made),
          sub: v.bc.undated ? `ועוד ${nf.format(v.bc.undated)} בלי תאריך` : undefined,
        },
        { label: 'שומשו', value: `${nf.format(v.bc.used)} רכישות`, sub: money.format(v.bc.usedPaid) },
        { label: 'יחס שימוש', value: pct(v.bc.used, v.bc.made), sub: 'הקופון תקף יום אחד', ring: v.bc.made ? v.bc.used / v.bc.made : null },
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
        <h3>
          מה קנו מי שקיבלו קופון{' '}
          <Info>
            מי שקיבל קופון אישי מהבוט בטווח, וכל מה שקנה מרגע הקופון והלאה, גם תחת קוד מזהה אחר עם אותו טלפון. הלקוח מקליד את הקוד בעצמו, והוובהוק רושם מה הוקלד
            (&quot;קופון מהרכישה&quot;). דמי הפעלה בנפרד, כי שם לא מקלידים קופון. הקוד נרשם בכל רכישה רק מ-{fmtDay(COUPON_RECORDED_FROM)}, ולפני כן &quot;בלי קוד&quot; כולל גם
            רכישות שהקוד שלהן לא נרשם.
          </Info>
        </h3>
        <Stats items={[
          { label: 'קיבלו קופון', value: nf.format(v.after.holders) },
          { label: 'קנו אחר כך', value: nf.format(v.after.buyers), sub: 'אתגר או מוצר', ring: v.after.holders ? v.after.buyers / v.after.holders : null },
        ]} />
        <Bars100
          label="הקוד שהוקלד"
          parts={[
            { value: v.after.byKind.personal.length, color: '--bot', text: nf.format(v.after.byKind.personal.length), more: 'הקוד האישי' },
            { value: v.after.byKind.generic.length, color: '--series-2', text: nf.format(v.after.byKind.generic.length), more: 'קוד כללי' },
            { value: v.after.byKind.none.length, color: '--notbot', text: nf.format(v.after.byKind.none.length), more: 'בלי קוד' },
          ]}
        />
        <Legend items={[{ label: 'הקוד האישי', color: '--bot' }, { label: 'קוד כללי', color: '--series-2' }, { label: 'בלי קוד', color: '--notbot' }]} />
        {v.after.generic.length > 0 && (
          <>
            <h3>הקודים הכלליים שהוקלדו במקום</h3>
            <BarList items={v.after.generic} max={6} color="--series-2" />
          </>
        )}
        <p className="hint tight">ועוד {nf.format(v.after.activation.length)} רכישות דמי הפעלה</p>
        <ListBlock
          note={note}
          items={[
            { id: 'ac-personal', title: 'קנו עם הקוד האישי', count: buysCount(v.after.byKind.personal), sum: buysSum(v.after.byKind.personal), render: () => <BuyList purchases={v.after.byKind.personal} /> },
            { id: 'ac-generic', title: 'קנו עם קוד כללי', count: buysCount(v.after.byKind.generic), sum: buysSum(v.after.byKind.generic), render: () => <BuyList purchases={v.after.byKind.generic} /> },
            { id: 'ac-none', title: 'קנו בלי קוד', count: buysCount(v.after.byKind.none), sum: buysSum(v.after.byKind.none), render: () => <BuyList purchases={v.after.byKind.none} /> },
            { id: 'ac-act', title: 'דמי הפעלה אחרי הקופון', count: buysCount(v.after.activation), sum: buysSum(v.after.activation), render: () => <BuyList purchases={v.after.activation} /> },
          ]}
        />
      </div>

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
          max={TOP_CODES}
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
    </Fold>
  );
}
