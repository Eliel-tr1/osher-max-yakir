'use client';

import { useMemo } from 'react';
import type { Purchase } from '@/lib/leads/types';
import { ACTIVATION, botBreakdown, botSide, byReason, isActivation, matrixByMonth, productStats, purchaseFamily, reasonOf, repeatBuyers, SIDE_LABEL } from '@/lib/metrics';
import { BarList, Bars100, Fold, HeatTable, Info, ListBlock, SimpleTable, Stats, money, nf, pct } from '../charts';
import { useLinkNote } from '../auth';
import { BuyList, buysCount, buysSum } from '../lists';
import { Chips, shortReason } from './shared';

export type Channel = 'all' | 'bot';

/**
 * פירוט הרכישות (הנחיית המנהל 3/11/2026, #27): סגור כברירת מחדל. הסיבות מופיעות פעם אחת, כצ'יפים, ולחיצה על צ'יפ פותחת את
 * הרשימה שלו. נשארים סוג מוצר, קונים חוזרים ודמי הפעלה. מקור הרכישה והכפולות עברו ללשונית "לצוות".
 */
export function PurchasesSection({ all, channel, setChannel, open, onToggle, chip, setChip }: {
  /** כל הרכישות בטווח (אחרי סינון המקור והתהליך) */
  all: Purchase[];
  channel: Channel;
  setChannel: (c: Channel) => void;
  open: boolean;
  onToggle: () => void;
  /** הסיבה שהרשימה שלה פתוחה (השם המלא). null = אף אחת */
  chip: string | null;
  setChip: (c: string | null) => void;
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
      x: botBreakdown(all),
      reasons: byReason(all),
      groups,
      activation,
      act: { all: botBreakdown(activation).all, yes: botBreakdown(activation).yes, rest: botBreakdown(activation.filter((p) => botSide(p) !== 'yes')).all },
      repeat: repeatBuyers(all),
      families: productStats(ps, purchaseFamily),
      products: productStats(ps),
      matrix: matrixByMonth(ps, purchaseFamily, (p) => p.at),
    };
  }, [all, channel]);
  const repeatTotal = { bot: v.repeat.reduce((s, r) => s + r.bot, 0), other: v.repeat.reduce((s, r) => s + r.other, 0) };
  const picked = chip ? v.groups.get(chip) ?? null : null;

  return (
    <Fold
      id="buys" title="רכישות" open={open} onToggle={onToggle}
      stats={[
        { label: 'רכישות', value: nf.format(v.x.all.purchases) },
        { label: 'הכנסות', value: money.format(v.x.all.paid) },
        { label: 'קונים', value: nf.format(v.x.all.buyers) },
      ]}
    >
      <h3>
        למה קנו{' '}
        <Info>
          &quot;סיבה&quot; בלשונית הרכישות, כמו שהסוכן של המנהל כתב. בכחול: סיבות של רכישות הבוט. לחיצה על סיבה פותחת את הרכישות שלה. רכישה שעוד לא הוכרעה נמצאת
          תחת &quot;עוד לא הוכרע&quot;.
        </Info>
      </h3>
      <div className="chipsline" role="group" aria-label="הסיבות">
        {v.reasons.map((r) => (
          <button key={r.name} type="button" className={r.side === 'yes' ? 'bot' : undefined} aria-expanded={chip === r.name} onClick={() => setChip(chip === r.name ? null : r.name)} title={r.name}>
            {shortReason(r.name)} <b>{nf.format(r.purchases)}</b>
          </button>
        ))}
      </div>
      {picked ? (
        <div className="chippanel" onKeyDown={(e) => e.key === 'Escape' && setChip(null)}>
          <p className="listsnote">{chip} · {buysCount(picked)} · {buysSum(picked)}{note ? ` · ${note}` : ''}</p>
          <BuyList purchases={picked} />
        </div>
      ) : null}

      <div className="cardhead">
        <span />
        <Chips value={channel} onChange={setChannel} label="איזה רכישות" options={[{ id: 'all', label: 'כל הרכישות' }, { id: 'bot', label: 'רק של הבוט' }]} />
      </div>
      <div className="two">
        <div>
          <h3>לפי סוג מוצר <Info>עד 20/10 שם המוצר לא נרשם בלשונית הרכישות, ולכן רכישות מלפני כן בלי שם מופיעות כ&quot;לפני 20/10 (בלי שם מוצר)&quot;. בכחול: רכישות של הבוט.</Info></h3>
          <BarList
            items={v.families.map((f) => ({ name: f.name, count: f.count }))} color={channel === 'bot' ? '--bot' : '--notbot'}
            part={channel === 'all' ? (n) => v.families.find((x) => x.name === n)?.bot ?? 0 : undefined}
            extra={(n) => { const f = v.families.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }}
          />
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
                    { value: total - once, color: k === 'bot' ? '--bot' : '--notbot', text: pct(total - once, total), more: 'חזרו' },
                    { value: once, color: '--open-a', text: pct(once, total), more: 'פעם אחת' },
                  ]}
                />
              );
            })}
            <p className="hint tight">{nf.format(repeatTotal.bot + repeatTotal.other)} קונים. החלק הצבוע = קנו יותר מפעם אחת</p>
          </div>
        </div>
      </div>

      <ListBlock
        title="פירוט"
        note={note}
        items={[
          {
            id: 'activation', title: ACTIVATION, count: buysCount(v.activation), sum: buysSum(v.activation),
            render: () => (
              <>
                <p className="hint tight">
                  איך לקרוא{' '}
                  <Info>תשלום אחרי מעבר אתגר כדי לפתוח את החשבון הממומן. נספר מוצר שבשם שלו יש activation, או רכישה בלי שם מוצר בסכום של דמי הפעלה (109, 139, 169, 249, 259, 349, 399).</Info>
                </p>
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
                <BuyList purchases={v.activation} />
              </>
            ),
          },
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
    </Fold>
  );
}
