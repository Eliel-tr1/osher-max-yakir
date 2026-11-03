'use client';

import { useMemo } from 'react';
import type { Purchase } from '@/lib/leads/types';
import { botHero, moneyShareSeries } from '@/lib/metrics';
import { Delta, Info, Ring, Sparkline, money, nf, pctOf } from '../charts';
import { fmtBucket } from './shared';

/**
 * "מה הבוט הביא" (הנחיית המנהל 3/11/2026, #27): במקום שמונת האריחים. מספר אחד ענק, החלק של הבוט מכל ההכנסות,
 * שלושה מספרים משניים, שינוי מול התקופה הקודמת, גרף קטן של החלק של הבוט לפי שבוע, ושורה אחת עם סך ההכנסות.
 */
export function BotHero({ all, prev }: { all: Purchase[]; prev: Purchase[] | null }) {
  const v = useMemo(() => ({ h: botHero(all, prev), share: moneyShareSeries(all, 'week') }), [all, prev]);
  const { h } = v;
  return (
    <section className="card hero" id="bot" aria-labelledby="bot-h">
      <div className="herotop">
        <div className="heromain">
          <h2 id="bot-h">
            מה הבוט הביא{' '}
            <Info>
              רכישות שבעמודה &quot;של הבוט&quot; בלשונית הרכישות כתוב בהן &quot;כן&quot;. את העמודה ממלא הסוכן של המנהל בכל לילה, באיחור מכוון של יום או יומיים.
              רכישה שנכתבה פעמיים נספרת פעם אחת. החלק של הבוט מכל ההכנסות כולל גם את מה שעוד לא הוכרע.
            </Info>
          </h2>
          <p className="heronum">
            {money.format(h.paid)}
            {h.change !== null ? <Delta value={h.change} /> : null}
          </p>
          <p className="herosub">
            <span><b>{nf.format(h.purchases)}</b> רכישות</span>
            <span><b>{nf.format(h.buyers)}</b> לקוחות</span>
            <span><b>{h.avgDeal === null ? '-' : money.format(h.avgDeal)}</b> עסקה ממוצעת</span>
          </p>
        </div>
        <div className="heroring">
          <Ring value={h.share} size={104} label="החלק של הבוט מכל ההכנסות" />
          <span>מכל ההכנסות</span>
        </div>
      </div>
      <div className="herospark">
        <Sparkline
          labels={v.share.map((d) => fmtBucket(d.key, 'week'))} values={v.share.map((d) => d.share)} color="--bot" height={40} max={1}
          format={(x) => pctOf(x)} label="החלק של הבוט מההכנסות, לפי שבוע" caption="החלק של הבוט, לפי שבוע"
        />
      </div>
      <p className="heroline">
        סך כל ההכנסות {money.format(h.totalPaid)} · עוד לא הוכרעו {nf.format(h.open.purchases)} רכישות ({money.format(h.open.paid)})
      </p>
    </section>
  );
}
