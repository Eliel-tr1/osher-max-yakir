'use client';

import { useMemo } from 'react';
import type { Purchase } from '@/lib/leads/types';
import {
  ACTIVATION, botBreakdown, botSide, byReason, isActivation, matrixByMonth, productStats, purchaseFamily, purchaseSources, reasonOf, repeatBuyers, SIDE_LABEL,
} from '@/lib/metrics';
import { BarList, Bars100, HeatTable, Info, ListBlock, SimpleTable, Stats, money, nf, pct } from '../charts';
import { useLinkNote } from '../auth';
import { BuyList, buysCount, buysSum } from '../lists';
import { Chips } from './shared';

export type Channel = 'all' | 'bot';

/** פירוט הרכישות: סוג מוצר, מקור, קונים חוזרים, דמי הפעלה ורשימות. המספרים של הבוט מול השאר בכרטיס שמעליו */
export function PurchasesSection({ all, dupes, channel, setChannel }: {
  /** כל הרכישות בטווח (אחרי סינון המקור והתהליך) */
  all: Purchase[];
  /** כמה שורות כפולות לא נספרו בטווח */
  dupes: number;
  channel: Channel;
  setChannel: (c: Channel) => void;
}) {
  const note = useLinkNote();
  const v = useMemo(() => {
    const ps = all.filter((p) => channel === 'all' || botSide(p) === 'yes');
    const activation = all.filter(isActivation);
    const groups = new Map<string, Purchase[]>();
    for (const p of all) {
      const k = reasonOf(p);
      const g = groups.get(k);
      if (g) g.push(p);
      else groups.set(k, [p]);
    }
    return {
      ps,
      reasons: byReason(all),
      groups,
      activation,
      act: { all: botBreakdown(activation).all, yes: botBreakdown(activation).yes, rest: botBreakdown(activation.filter((p) => botSide(p) !== 'yes')).all },
      repeat: repeatBuyers(all),
      families: productStats(ps, purchaseFamily),
      products: productStats(ps),
      sources: purchaseSources(ps),
      matrix: matrixByMonth(ps, purchaseFamily, (p) => p.at),
    };
  }, [all, channel]);
  const repeatTotal = { bot: v.repeat.reduce((s, r) => s + r.bot, 0), other: v.repeat.reduce((s, r) => s + r.other, 0) };

  return (
    <section className="card" id="buys" aria-labelledby="buys-h">
      <div className="cardhead">
        <h2 id="buys-h">רכישות</h2>
        <Chips value={channel} onChange={setChannel} label="איזה רכישות" options={[{ id: 'all', label: 'כל הרכישות' }, { id: 'bot', label: 'רק של הבוט' }]} />
      </div>
      <p className="hint tight">
        {nf.format(dupes)} רכישות כפולות לא נספרו{' '}
        <Info>אותה רכישה שנכתבה בגיליון פעמיים: אותו קונה ואותו סכום בתוך שתי דקות. נספרת פעם אחת.</Info>
      </p>

      <div className="three">
        <div>
          <h3>לפי סוג מוצר</h3>
          <BarList items={v.families.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = v.families.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
        </div>
        <div>
          <h3>מקור הרכישה (utm) <Info>&quot;מקור הגעה&quot; בלשונית הרכישות: ה-utm_source שהגיע עם הרכישה, או שם המוצר כשלא היה utm. נרשם מ-27/10.</Info></h3>
          <BarList items={v.sources.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = v.sources.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
        </div>
        <div>
          <h3>קונים חוזרים <Info>כמה מהקונים קנו יותר מפעם אחת, בכל צד לפי הרכישות שלו באותו צד. &quot;לא של הבוט&quot; כולל גם מה שעוד לא הוכרע. הפירוט המלא ברשימות למטה.</Info></h3>
          <div className="stack100">
            {(['bot', 'other'] as const).map((k) => {
              const once = v.repeat[0]?.[k] ?? 0;
              const total = repeatTotal[k];
              return (
                <Bars100
                  key={k}
                  label={k === 'bot' ? SIDE_LABEL.yes : SIDE_LABEL.no}
                  parts={[
                    { value: once, color: k === 'bot' ? '--bot' : '--notbot', text: pct(once, total), more: 'פעם אחת' },
                    { value: total - once, color: '--series-2', text: pct(total - once, total), more: 'חזרו' },
                  ]}
                />
              );
            })}
            <p className="hint tight">{nf.format(repeatTotal.bot + repeatTotal.other)} קונים. כתום = קנו יותר מפעם אחת</p>
          </div>
        </div>
      </div>

      <div className="box">
        <h3>
          {ACTIVATION}{' '}
          <Info>תשלום אחרי מעבר אתגר כדי לפתוח את החשבון הממומן. נספר מוצר שבשם שלו יש activation, או רכישה בלי שם מוצר בסכום של דמי הפעלה (109, 139, 169, 249, 259, 349, 399).</Info>
        </h3>
        <Stats items={[
          { label: 'רכישות', value: nf.format(v.activation.length), sub: `${pct(v.activation.length, all.length)} מכל הרכישות`, ring: all.length ? v.activation.length / all.length : null },
          { label: 'סכום', value: money.format(v.act.all.paid) },
        ]} />
        <Bars100
          label="רכישות"
          parts={[
            { value: v.act.yes.purchases, color: '--bot', text: nf.format(v.act.yes.purchases), more: SIDE_LABEL.yes },
            { value: v.act.rest.purchases, color: '--notbot', text: nf.format(v.act.rest.purchases), more: SIDE_LABEL.no },
          ]}
        />
        <Bars100
          label="סכום"
          parts={[
            { value: v.act.yes.paid, color: '--bot', text: money.format(v.act.yes.paid) },
            { value: v.act.rest.paid, color: '--notbot', text: money.format(v.act.rest.paid) },
          ]}
        />
      </div>

      <ListBlock
        note={note}
        items={[
          ...v.reasons.map((r) => {
            const g = v.groups.get(r.name) ?? [];
            return { id: `r-${r.name}`, title: r.name, count: buysCount(g), sum: buysSum(g), render: () => <BuyList purchases={g} /> };
          }),
          { id: 'activation', title: ACTIVATION, count: buysCount(v.activation), sum: buysSum(v.activation), render: () => <BuyList purchases={v.activation} /> },
          {
            id: 'products', title: 'כל המוצרים', count: `${nf.format(v.products.length)} מוצרים`,
            render: () => (
              <SimpleTable
                max={200}
                headers={['מוצר', 'רכישות', 'של הבוט', 'סכום', 'ממוצע', 'הכי נמוך', 'הכי גבוה']}
                rows={v.products.map((p) => ({ key: p.name, cells: [p.name, nf.format(p.count), nf.format(p.bot), money.format(p.revenue), p.avg === null ? '-' : money.format(p.avg), p.min === null ? '-' : money.format(p.min), p.max === null ? '-' : money.format(p.max)] }))}
              />
            ),
          },
          {
            id: 'repeat', title: 'קונים חוזרים: הפירוט',
            render: () => (
              <SimpleTable
                headers={['רכישות לקונה', 'של הבוט', 'לא של הבוט']}
                rows={v.repeat.map((r) => ({ key: r.name, cells: [r.name, `${nf.format(r.bot)} (${pct(r.bot, repeatTotal.bot)})`, `${nf.format(r.other)} (${pct(r.other, repeatTotal.other)})`] }))}
              />
            ),
          },
          { id: 'matrix', title: 'סוגי מוצרים לפי חודש', render: () => <HeatTable {...v.matrix} nameHeader="סוג מוצר" /> },
        ]}
      />
    </section>
  );
}
