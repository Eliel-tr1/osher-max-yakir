'use client';

import { useMemo } from 'react';
import type { Purchase } from '@/lib/leads/types';
import { botHero, botKpis, botSeries, type BotKpi } from '@/lib/metrics';
import { Delta, Info, Trend, money, nf, pctOf } from '../charts';
import { fmtBucket } from './shared';

const KPI: Record<BotKpi['id'], { label: string; format: (v: number | null) => string }> = {
  share: { label: 'חלק מההכנסות', format: pctOf },
  purchases: { label: 'רכישות', format: (v) => (v === null ? '-' : nf.format(v)) },
  buyers: { label: 'לקוחות', format: (v) => (v === null ? '-' : nf.format(v)) },
  avgDeal: { label: 'עסקה ממוצעת', format: (v) => (v === null ? '-' : money.format(v)) },
};

/** השינוי ב"חלק מההכנסות" הוא בנקודות אחוז, ובשאר המדדים באחוזים */
function KpiChange({ kpi }: { kpi: BotKpi }) {
  if (kpi.change === null) return null;
  if (kpi.id !== 'share') return <Delta value={kpi.change} />;
  return <span className="delta" title="מול התקופה הקודמת באותו אורך">{kpi.change >= 0 ? '▲' : '▼'} {nf.format(Math.round(Math.abs(kpi.change) * 100))} נק׳</span>;
}

/**
 * "מה הבוט הביא" (עיצוב א4, #34): המספר הגדול וגרף ה-€ לפי שבוע, ארבעה מדדים עם מגמה, ופס שמחלק את כל ההכנסות.
 * אותו חישוב של "של הבוט" כמו בכל הדף.
 */
export function BotHero({ all, prev }: { all: Purchase[]; prev: Purchase[] | null }) {
  const v = useMemo(() => ({ h: botHero(all, prev), kpis: botKpis(all, prev), weeks: botSeries(all, 'week', 'money') }), [all, prev]);
  const { h } = v;
  const rest = Math.max(0, h.totalPaid - h.paid - h.open.paid);
  const w = (x: number) => `${h.totalPaid ? (x / h.totalPaid) * 100 : 0}%`;
  return (
    <section className="card hero" id="bot" aria-labelledby="bot-h">
      <div className="heromain">
        <h2 id="bot-h">
          מה הבוט הביא{' '}
          <Info>
            רכישות שבעמודה &quot;של הבוט&quot; בלשונית הרכישות כתוב בהן &quot;כן&quot;. את העמודה ממלא הסוכן של המנהל בכל לילה, באיחור מכוון של יום או יומיים.
            רכישה שנכתבה פעמיים נספרת פעם אחת. החלק של הבוט מכל ההכנסות כולל גם את מה שעוד לא הוכרע.
          </Info>
        </h2>
        <p className="heronum">{money.format(h.paid)}</p>
        {h.change !== null ? <p className="herochange"><Delta value={h.change} /> מול התקופה הקודמת</p> : null}
        <div className="heroarea">
          <Trend values={v.weeks.map((d) => d.values[0])} color="--bot" height={84} area label="€ של הבוט, לפי שבוע" />
          {v.weeks.length > 0 ? (
            <div className="sparkfoot" dir="ltr">
              <span>{fmtBucket(v.weeks[0].key, 'week')}</span>
              <span className="sparkcap" dir="rtl">€ של הבוט, לפי שבוע</span>
              <span>{fmtBucket(v.weeks[v.weeks.length - 1].key, 'week')}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="kpis">
        {v.kpis.map((k) => (
          <div key={k.id} className="kpi">
            <span className="kpilabel">{KPI[k.id].label}</span>
            <span className="kpivalue"><b>{KPI[k.id].format(k.value)}</b><KpiChange kpi={k} /></span>
            <Trend values={k.weekly} label={`${KPI[k.id].label} לפי שבוע`} />
          </div>
        ))}
      </div>
      <div className="heroshare">
        <div className="sharebar" role="img" aria-label={`של הבוט ${money.format(h.paid)}, לא של הבוט ${money.format(rest)}, עוד לא הוכרעו ${money.format(h.open.paid)}`}>
          <span style={{ width: w(h.paid), background: 'var(--bot)' }} />
          <span style={{ width: w(rest), background: 'var(--notbot)' }} />
          <span className="hatch" style={{ width: w(h.open.paid) }} />
        </div>
        <p className="sharelegend">
          <span><b className="isbot">{money.format(h.paid)}</b> של הבוט</span>
          <span><b>{money.format(rest)}</b> לא של הבוט</span>
          <span><b>{money.format(h.open.paid)}</b> עוד לא הוכרעו ({nf.format(h.open.purchases)} רכישות)</span>
          <span><b>{money.format(h.totalPaid)}</b> סך ההכנסות</span>
        </p>
      </div>
    </section>
  );
}
