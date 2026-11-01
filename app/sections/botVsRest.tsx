'use client';

import { useMemo, useState } from 'react';
import type { Purchase } from '@/lib/leads/types';
import {
  autoBucket, botBreakdown, botSeries, botShareSeries, botSide, change, reasonGroups, reasonOf, SIDE_LABEL, type BotSide, type Bucket,
} from '@/lib/metrics';
import { Bars100, BarTable, Columns, Delta, Info, Legend, ShareStrip, money, nf, pctOf, type Series } from '../charts';
import { BuyList } from '../lists';
import { useLinkNote } from '../auth';
import { BucketChips, Chips, fmtBucket } from './shared';

/** הצבעים של "של הבוט" מול השאר, אחידים בכל הדף (הנחיית המנהל, 1/11/2026) */
export const SIDE: Record<BotSide, { color: string; hatch?: boolean }> = {
  yes: { color: '--bot' },
  no: { color: '--notbot' },
  open: { color: '--open-b', hatch: true },
};
export const SIDE_SERIES_2: Series[] = (['yes', 'no', 'open'] as BotSide[]).map((k) => ({ key: k, label: SIDE_LABEL[k], ...SIDE[k] }));

/** שם קצר לצ'יפ של סיבה (הקופון האישי, גם של איש קשר אחר, הוא צ'יפ אחד) */
export function shortReason(name: string): string {
  if (name.startsWith('קופון הבוט')) return 'קופון הבוט';
  const m: Record<string, string> = {
    'שיחה מכירתית לפני הרכישה': 'שיחה מכירתית',
    'הבוט שלח קישור לאתר': 'קישור לאתר',
    'קישור הבוט (vitrue)': 'קישור vitrue',
    'הבוט שלח קופון או קישור רכישה': 'קופון או קישור רכישה',
  };
  return m[name] ?? name;
}

export type Measure = 'count' | 'money';

/**
 * "רכישות: הבוט מול השאר": במבט אחד כמה רכישות של הבוט וכמה לא (הנחיית המנהל, 1/11/2026).
 * prev: הרכישות בתקופה הקודמת באותו אורך, להשוואה. null = אין השוואה (הכול, או תאריכים אחרים).
 */
export function BotVsRest({ all, prev, by, setBy, measure, setMeasure }: {
  all: Purchase[];
  prev: Purchase[] | null;
  by: Bucket | null;
  setBy: (b: Bucket | null) => void;
  measure: Measure;
  setMeasure: (m: Measure) => void;
}) {
  const [chip, setChip] = useState<string | null>(null);
  const note = useLinkNote();
  const v = useMemo(() => {
    const auto = autoBucket(all);
    const b = by ?? auto;
    const chips = new Map<string, Purchase[]>();
    for (const p of all) {
      if (botSide(p) !== 'yes') continue;
      const k = shortReason(reasonOf(p));
      const g = chips.get(k);
      if (g) g.push(p);
      else chips.set(k, [p]);
    }
    return {
      auto, b,
      x: botBreakdown(all),
      before: prev ? botBreakdown(prev) : null,
      series: botSeries(all, b, measure),
      share: botShareSeries(all, b),
      chips: [...chips.entries()].sort((a, c) => c[1].length - a[1].length),
      groups: reasonGroups(all),
    };
  }, [all, prev, by, measure]);
  const { x, before } = v;
  const pctOfAll = (n: number, d: number) => (d ? n / d : null);

  return (
    <section className="card" id="bot" aria-labelledby="bot-h">
      <div className="cardhead">
        <h2 id="bot-h">
          רכישות: הבוט מול השאר{' '}
          <Info>
            של הבוט = בעמודה &quot;של הבוט&quot; בלשונית הרכישות כתוב &quot;כן&quot;. את העמודה ממלא הסוכן של המנהל בכל לילה, באיחור מכוון של יום או יומיים. כל ערך
            אחר הוא לא של הבוט, ותא ריק הוא רכישה שעוד לא הוכרעה. רכישה שנכתבה פעמיים נספרת פעם אחת.
          </Info>
        </h2>
        <div className="chipsrow">
          <Chips value={measure} onChange={setMeasure} label="מה למדוד" options={[{ id: 'count', label: 'כמות' }, { id: 'money', label: 'סכום' }]} />
          <BucketChips value={by} auto={v.auto} onChange={setBy} />
        </div>
      </div>

      <div className="vs">
        <div className="big">
          <span className="label"><i style={{ background: 'var(--bot)' }} />{SIDE_LABEL.yes}</span>
          <span className="value">{nf.format(x.yes.purchases)}<small>רכישות</small>{before ? <Delta value={change(x.yes.purchases, before.yes.purchases)} /> : null}</span>
          <span className="sub">{money.format(x.yes.paid)} · {nf.format(x.yes.buyers)} קונים</span>
        </div>
        <div className="big">
          <span className="label"><i style={{ background: 'var(--notbot)' }} />{SIDE_LABEL.no}</span>
          <span className="value">{nf.format(x.no.purchases)}<small>רכישות</small>{before ? <Delta value={change(x.no.purchases, before.no.purchases)} /> : null}</span>
          <span className="sub">{money.format(x.no.paid)}</span>
        </div>
      </div>
      <p className="muted">
        עוד לא הוכרעו: {nf.format(x.open.purchases)} · {money.format(x.open.paid)} (יוכרעו בסריקת הלילה)
        {before ? ' · ▲▼ מול התקופה הקודמת באותו אורך' : ''}
      </p>

      <Bars100
        label="רכישות"
        parts={[
          { value: x.yes.purchases, color: '--bot', text: pctOf(pctOfAll(x.yes.purchases, x.all.purchases)), more: 'מהרכישות' },
          { value: x.no.purchases, color: '--notbot', text: `${pctOf(pctOfAll(x.no.purchases, x.all.purchases))}` },
          { value: x.open.purchases, color: '--open-b', hatch: true, text: `${pctOf(pctOfAll(x.open.purchases, x.all.purchases))}` },
        ]}
      />
      <Bars100
        label="סכום"
        parts={[
          { value: x.yes.paid, color: '--bot', text: pctOf(pctOfAll(x.yes.paid, x.all.paid)), more: 'מהסכום' },
          { value: x.no.paid, color: '--notbot', text: `${pctOf(pctOfAll(x.no.paid, x.all.paid))}` },
          { value: x.open.paid, color: '--open-b', hatch: true, text: `${pctOf(pctOfAll(x.open.paid, x.all.paid))}` },
        ]}
      />
      <Legend items={SIDE_SERIES_2} />

      <h3>לאורך זמן</h3>
      <Columns
        labels={v.series.map((d) => fmtBucket(d.key, v.b))}
        values={v.series.map((d) => d.values)}
        series={SIDE_SERIES_2}
        isMoney={measure === 'money'}
        extraTip={(i) => (v.share[i]?.share === null || v.share[i] === undefined ? null : `החלק של הבוט: ${pctOf(v.share[i].share)}`)}
      />
      <ShareStrip labels={v.share.map((d) => fmtBucket(d.key, v.b))} values={v.share.map((d) => d.share)} color="--bot" label="החלק של הבוט מהרכישות" />

      <h3>למה של הבוט</h3>
      <div className="chipsline" role="group" aria-label="הסיבות של הבוט">
        {v.chips.map(([name, ps]) => (
          <button key={name} type="button" aria-expanded={chip === name} onClick={() => setChip(chip === name ? null : name)}>
            {name} <b>{nf.format(ps.length)}</b>
          </button>
        ))}
      </div>
      {chip && v.chips.find(([n]) => n === chip) ? (
        <div className="chippanel" onKeyDown={(e) => e.key === 'Escape' && setChip(null)}>
          {note ? <p className="listsnote">{note}</p> : null}
          <BuyList purchases={v.chips.find(([n]) => n === chip)![1]} />
        </div>
      ) : null}

      <h3>לפי סיבה</h3>
      <BarTable
        headers={['סיבה', '', 'רכישות', 'סכום', 'קונים']}
        max={40}
        rows={v.groups.flatMap((g) => [
          {
            key: `g-${g.side}`, group: true, name: SIDE_LABEL[g.side], segments: [],
            cells: [nf.format(g.total.purchases), money.format(g.total.paid), nf.format(g.total.buyers)],
          },
          ...g.rows.map((r) => ({
            key: r.name, name: r.name, title: r.name,
            segments: [{ value: r.purchases, color: SIDE[g.side].color, hatch: SIDE[g.side].hatch, label: SIDE_LABEL[g.side] }],
            cells: [nf.format(r.purchases), money.format(r.paid), nf.format(r.buyers)],
          })),
        ])}
      />
    </section>
  );
}
