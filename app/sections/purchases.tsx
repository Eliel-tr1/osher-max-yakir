'use client';

import { useMemo } from 'react';
import type { Lead, Purchase } from '@/lib/leads/types';
import {
  ACTIVATION, autoBucket, botBreakdown, botSeries, botSide, buyItems, byReason, isActivation, matrixByMonth, NO_PRODUCT, productStats, purchaseFamily,
  purchaseGaps, purchaseSources, reasonOf, repeatBuyers, SIDE_LABEL, type BotSide, type Bucket, type BuyRow,
} from '@/lib/metrics';
import { BarList, BarTable, Columns, Fold, HeatTable, LazyFold, Legend, SimpleTable, Stats, fmtDate, money, nf, num1, pct, pctOf } from '../charts';
import { BuyList, listMeta } from '../lists';
import { BucketChips, Chips, fmtBucket, Keyed, SIDE_COLOR, SIDE_SERIES } from './shared';

export type Channel = 'all' | 'bot';
export type Measure = 'count' | 'money';

/** סקשן הרכישות: לפי "של הבוט" ו"סיבה" שהסוכן של המנהל ממלא (הנחיית המנהל, 31/10/2026) */
export function PurchasesSection({ all, purchases, leads, channel, setChannel, measure, setMeasure, by, setBy }: {
  /** כל הרכישות בטווח (אחרי סינון המקור והתהליך) */
  all: Purchase[];
  /** כל הרכישות בקובץ, לפער בנתונים ולבחירת יחידת הזמן */
  purchases: Purchase[];
  leads: Lead[];
  channel: Channel;
  setChannel: (c: Channel) => void;
  measure: Measure;
  setMeasure: (m: Measure) => void;
  by: Bucket | null;
  setBy: (b: Bucket | null) => void;
}) {
  const v = useMemo(() => {
    const ps = all.filter((p) => channel === 'all' || botSide(p) === 'yes');
    const auto = autoBucket(all);
    const b = by ?? auto;
    const activation = all.filter(isActivation);
    const groups = new Map<string, Purchase[]>();
    for (const p of all) {
      const k = reasonOf(p);
      const g = groups.get(k);
      if (g) g.push(p);
      else groups.set(k, [p]);
    }
    return {
      ps, auto, b,
      bots: botBreakdown(all),
      series: botSeries(ps, b, measure),
      reasons: byReason(all),
      groups,
      activation,
      activationSplit: { yes: botBreakdown(activation).yes, rest: botBreakdown(activation.filter((p) => botSide(p) !== 'yes')).all },
      repeat: repeatBuyers(all),
      families: productStats(ps, purchaseFamily),
      products: productStats(ps),
      sources: purchaseSources(ps),
      matrix: matrixByMonth(ps, purchaseFamily, (p) => p.at),
    };
  }, [all, channel, by, measure]);
  const gaps = useMemo(() => purchaseGaps(purchases), [purchases]);
  const { bots } = v;

  const row = (name: string, x: BuyRow, side?: BotSide) => ({
    key: name,
    cells: [
      <Keyed key="n" color={side ? SIDE_COLOR[side] : undefined}>{name}</Keyed>,
      nf.format(x.purchases), money.format(x.paid), nf.format(x.buyers), num1(x.perBuyer),
      x.paidPerBuyer === null ? '-' : money.format(x.paidPerBuyer), x.avgDeal === null ? '-' : money.format(x.avgDeal),
    ],
  });
  const repeatTotal = { bot: v.repeat.reduce((s, r) => s + r.bot, 0), other: v.repeat.reduce((s, r) => s + r.other, 0) };

  return (
    <section className="card" aria-labelledby="buys-h">
      <div className="cardhead">
        <h2 id="buys-h">רכישות</h2>
        <div className="chipsrow">
          <Chips value={channel} onChange={setChannel} label="איזה רכישות" options={[{ id: 'all', label: 'כל הרכישות' }, { id: 'bot', label: 'רק של הבוט' }]} />
          <Chips value={measure} onChange={setMeasure} label="מה למדוד" options={[{ id: 'count', label: 'כמות' }, { id: 'money', label: 'סכום' }]} />
          <BucketChips value={by} auto={v.auto} onChange={setBy} />
        </div>
      </div>

      <SimpleTable
        headers={['', 'רכישות', 'סכום', 'קונים', 'רכישות לקונה', '€ לקונה', 'עסקה ממוצעת']}
        rows={[
          row('כל הרכישות', bots.all),
          row(SIDE_LABEL.yes, bots.yes, 'yes'),
          row(SIDE_LABEL.no, bots.no, 'no'),
          row(SIDE_LABEL.open, bots.open, 'open'),
        ]}
      />
      <p className="share">
        החלק של הבוט: <strong>{pctOf(bots.share.purchases)}</strong> מהרכישות ו-<strong>{pctOf(bots.share.paid)}</strong> מהסכום.
      </p>

      <Columns
        labels={v.series.map((d) => fmtBucket(d.key, v.b))}
        values={v.series.map((d) => d.values)}
        series={SIDE_SERIES}
        isMoney={measure === 'money'}
      />

      <h3>לפי סיבה</h3>
      <Legend items={SIDE_SERIES} />
      <BarTable
        headers={['סיבה', '', 'רכישות', 'סכום', 'קונים']}
        max={20}
        rows={v.reasons.map((r) => ({
          key: r.name,
          name: r.name,
          title: r.name,
          segments: [
            { value: r.yes, color: SIDE_COLOR.yes, label: SIDE_LABEL.yes },
            { value: r.no, color: SIDE_COLOR.no, label: SIDE_LABEL.no },
            { value: r.open, color: SIDE_COLOR.open, label: SIDE_LABEL.open },
          ],
          cells: [nf.format(r.purchases), money.format(r.paid), nf.format(r.buyers)],
        }))}
      />

      <div className="three">
        <div>
          <h3>לפי סוג מוצר</h3>
          <BarList items={v.families.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = v.families.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
        </div>
        <div>
          <h3>מקור הרכישה (utm)</h3>
          <BarList items={v.sources.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = v.sources.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
        </div>
        <div>
          <h3>קונים חוזרים</h3>
          <SimpleTable
            headers={['רכישות לקונה', 'של הבוט', 'לא של הבוט']}
            rows={v.repeat.map((r) => ({ key: r.name, cells: [r.name, `${nf.format(r.bot)} (${pct(r.bot, repeatTotal.bot)})`, `${nf.format(r.other)} (${pct(r.other, repeatTotal.other)})`] }))}
          />
          <p className="hint tight">כל קונה נספר לפי מספר הרכישות שלו בכל צד. &quot;לא של הבוט&quot; כולל גם רכישות שעוד לא הוכרעו.</p>
        </div>
      </div>

      <div className="box">
        <h3>{ACTIVATION}</h3>
        <p className="hint tight">תשלום אחרי מעבר אתגר כדי לפתוח את החשבון הממומן. נספר כאן מוצר שבשם שלו יש activation, או רכישה בלי שם מוצר בסכום של דמי הפעלה.</p>
        <Stats items={[
          { label: 'רכישות', value: nf.format(v.activation.length), sub: pct(v.activation.length, all.length) + ' מכל הרכישות' },
          { label: 'סכום', value: money.format(botBreakdown(v.activation).all.paid) },
          { label: SIDE_LABEL.yes, value: nf.format(v.activationSplit.yes.purchases), sub: money.format(v.activationSplit.yes.paid) },
          { label: SIDE_LABEL.no, value: nf.format(v.activationSplit.rest.purchases), sub: `${money.format(v.activationSplit.rest.paid)} · כולל מה שעוד לא הוכרע` },
        ]} />
      </div>

      <div className="box lists">
        <h3>רשימות</h3>
        <p className="hint tight">כל רשימה נפתחת בלחיצה, מהחדש לישן.</p>
        {v.reasons.map((r) => {
          const g = v.groups.get(r.name) ?? [];
          return (
            <LazyFold key={r.name} title={r.name} meta={listMeta(g)}>
              {() => <BuyList items={buyItems(g, leads)} />}
            </LazyFold>
          );
        })}
        <LazyFold title={ACTIVATION} meta={listMeta(v.activation)}>
          {() => <BuyList items={buyItems(v.activation, leads)} />}
        </LazyFold>
      </div>

      <p className="hint">
        &quot;של הבוט&quot; ו&quot;סיבה&quot; נקראים מהעמודות האלה בלשונית הרכישות, שהסוכן של המנהל ממלא בכל לילה, באיחור מכוון של יום או יומיים. רק &quot;כן&quot; נחשב של הבוט, ותא ריק הוא
        רכישה שעוד לא הוכרעה. אותה רכישה שנכתבה פעמיים (אותו קונה ואותו סכום בתוך שתי דקות) נספרת פעם אחת. רכישות בלי סכום נספרות אבל לא נכנסות לסכומים ולממוצע.
        שם מוצר שלא נרשם מופיע כ&quot;{NO_PRODUCT}&quot;.
        {gaps.first ? <> לשונית &quot;רכישות&quot; מתחילה בפועל ב-{fmtDate(`${gaps.first}T12:00:00Z`)}.</> : null}
        {gaps.missing.length ? <> ב-{gaps.missing.map((d) => fmtDate(`${d}T12:00:00Z`)).join(' וב-')} אין שורות בכלל: זה כנראה פער בנתונים, וזה עדיין נבדק.</> : null}
      </p>

      <Fold title="כל המוצרים" count={v.products.length}>
        <SimpleTable
          headers={['מוצר', 'רכישות', 'של הבוט', 'סכום', 'ממוצע', 'הכי נמוך', 'הכי גבוה']}
          rows={v.products.map((p) => ({ key: p.name, cells: [p.name, nf.format(p.count), nf.format(p.bot), money.format(p.revenue), p.avg === null ? '-' : money.format(p.avg), p.min === null ? '-' : money.format(p.min), p.max === null ? '-' : money.format(p.max)] }))}
        />
      </Fold>
      <Fold title="סוגי מוצרים לפי חודש">
        <HeatTable {...v.matrix} nameHeader="סוג מוצר" />
      </Fold>
    </section>
  );
}
