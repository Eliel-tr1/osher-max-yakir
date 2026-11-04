'use client';

import { useMemo, useState } from 'react';
import type { Purchase } from '@/lib/leads/types';
import { campaignLabel, campaigns, NO_CAMPAIGN, trackingHealth, TRACKING_BANNER_MIN, type TrackingHealth } from '@/lib/metrics';
import type { Lead } from '@/lib/leads/types';
import { BarList, BarTable, Fold, Info, Legend, ListBlock, Stats, money, nf, pct } from '../charts';
import { SIDE } from './shared';
import { Chips } from './shared';

export function useTrackingHealth(leads: Lead[], at: string): TrackingHealth {
  return useMemo(() => trackingHealth(leads, at ? new Date(at) : new Date()), [leads, at]);
}

/** מה לתקן ואיפה, לפי הפלטפורמה של הקוד שלא מולא (הנחיית המנהל, 1/11/2026) */
const FIX: Record<'Google Ads' | 'Meta', string> = {
  'Google Ads': 'ב-Final URL suffix או ב-Tracking template',
  Meta: 'ב-URL parameters של המודעה',
};

/** האם להציג פס אדום בראש הדף: רק מ-5 אנשים ב-7 ימים */
export function trackingBanner(h: TrackingHealth): boolean {
  return h.last7 >= TRACKING_BANNER_MIN;
}

/** כרטיס "תקינות מעקב קמפיינים". נקודה אדומה ליד הכותרת כשיש אפילו אדם אחד ב-7 הימים האחרונים */
export function TrackingSection({ health, all, open, onToggle }: { health: TrackingHealth; all: Purchase[]; open: boolean; onToggle: () => void }) {
  const [sort, setSort] = useState<'count' | 'money'>('count');
  const rows = useMemo(() => {
    const r = campaigns(all).filter((c) => c.name !== NO_CAMPAIGN);
    return sort === 'money' ? [...r].sort((a, b) => b.revenue - a.revenue || b.count - a.count) : r;
  }, [all, sort]);
  const without = useMemo(() => all.filter((p) => !p.campaign), [all]);
  const red = health.last7 > 0;

  return (
    <Fold
      id="tracking" open={open} onToggle={onToggle}
      title={<>תקינות מעקב קמפיינים{red ? <span className="dot" role="img" aria-label="יש מה לתקן" /> : null}</>}
      stats={[
        { label: 'לא מולא', value: nf.format(health.total) },
        { label: 'ב-7 ימים', value: nf.format(health.last7) },
      ]}
    >
      {red ? (
        health.platforms.map((p) => (
          <p key={p} className="notice error inline" role="alert">
            צריך לתקן במודעות <bdi>{p}</bdi> {FIX[p]}.
          </p>
        ))
      ) : (
        <p className="hint tight">תקין: אין קמפיין שלא מולא ב-7 הימים האחרונים.</p>
      )}
      <Stats items={[
        {
          label: 'אנשים עם קמפיין שלא מולא', value: nf.format(health.total),
          info: (
            <>
              ב-<bdi>utm_campaign</bdi> של האדם כתוב שם של שדה במקום שם הקמפיין, למשל <bdi>{'{campaignname}'}</bdi> (<bdi>Google Ads</bdi>) או{' '}
              <bdi>{'{{campaign.name}}'}</bdi> (<bdi>Meta</bdi>). אז אי אפשר לשייך את הרכישות שלהם לקמפיין. נספר מ-1/9.
            </>
          ),
        },
        { label: 'ב-7 הימים האחרונים', value: nf.format(health.last7), info: 'לפי תאריך הכניסה, עד עדכון הנתונים. מ-5 אנשים מופיע גם פס אדום בראש הדף.' },
      ]} />
      {health.byValue.length > 0 && (
        <BarList items={health.byValue.map((x) => ({ name: x.name, count: x.count }))} color="--notbot" extra={(n) => { const x = health.byValue.find((y) => y.name === n); return x ? `7 ימים: ${nf.format(x.last7)}` : null; }} />
      )}

      <ListBlock
        title="פירוט"
        items={[{
          id: 'campaigns', title: 'קמפיינים מובילים', count: `${nf.format(rows.length)} קמפיינים`,
          render: () => (
            <>
              <div className="cardhead">
                <p className="hint tight">
                  איך לקרוא{' '}
                  <Info>רק <bdi>utm_campaign</bdi> של הרכישה עצמה (בלשונית הרכישות, נרשם מ-30/10), בלי הקמפיין של האדם. רכישה בלי קמפיין נספרת בנפרד.</Info>
                </p>
                <Chips value={sort} onChange={setSort} label="סדר" options={[{ id: 'count', label: 'לפי רכישות' }, { id: 'money', label: 'לפי סכום' }]} />
              </div>
              <Legend items={[{ label: 'רכישות של הבוט', color: SIDE.yes.color }, { label: 'שאר הרכישות', color: SIDE.no.color }]} />
              <BarTable
                headers={['קמפיין', '', 'רכישות', 'סכום', 'של הבוט']}
                rows={rows.map((c) => ({
                  key: c.name,
                  name: campaignLabel(c.name),
                  title: c.name,
                  segments: [{ value: c.bot, color: SIDE.yes.color, label: 'של הבוט' }, { value: c.count - c.bot, color: SIDE.no.color, label: 'שאר הרכישות' }],
                  cells: [nf.format(c.count), money.format(c.revenue), `${nf.format(c.bot)} (${pct(c.bot, c.count)})`],
                }))}
              />
              <p className="hint tight">{NO_CAMPAIGN}: {nf.format(without.length)} רכישות · {money.format(without.reduce((s, p) => s + (p.amount && p.amount > 0 ? p.amount : 0), 0))}</p>
            </>
          ),
        }]}
      />
    </Fold>
  );
}
