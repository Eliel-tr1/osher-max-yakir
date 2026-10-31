'use client';

import { useMemo, useState } from 'react';
import type { Lead, Purchase } from '@/lib/leads/types';
import { campaignOf, campaigns, trackingHealth, type TrackingHealth } from '@/lib/metrics';
import { BarList, BarTable, Legend, Stats, money, nf, pct } from '../charts';
import { Chips } from './shared';

/** הטקסט הקבוע של הכרטיס האדום (הנחיית המנהל, 31/10/2026) */
export const TRACKING_ALERT =
  'מודעות Google Ads שולחות utm_campaign שלא מולא ({campaignname}), ולכן אי אפשר לשייך את הרכישות שלהן לקמפיין. צריך לתקן במודעות את ה-Final URL suffix או את ה-Tracking template.';

export function useTrackingHealth(leads: Lead[], at: string): TrackingHealth {
  return useMemo(() => trackingHealth(leads, at ? new Date(at) : new Date()), [leads, at]);
}

/** הטקסט הקבוע, עם בידוד של המילים באנגלית כדי שהסוגריים והמקפים יוצגו נכון בעברית */
function TrackingAlert() {
  return (
    <p className="notice error" role="alert">
      מודעות <bdi>Google Ads</bdi> שולחות <bdi>utm_campaign</bdi> שלא מולא (<bdi>{'{campaignname}'}</bdi>), ולכן אי אפשר לשייך את הרכישות שלהן לקמפיין. צריך לתקן
      במודעות את ה-<bdi>Final URL suffix</bdi> או את ה-<bdi>Tracking template</bdi>.
    </p>
  );
}

/** כרטיס "תקינות מעקב קמפיינים": אדום כשיש אפילו אדם אחד ב-7 הימים האחרונים עם קמפיין שלא מולא */
export function TrackingSection({ health, leads, all }: { health: TrackingHealth; leads: Lead[]; all: Purchase[] }) {
  const [sort, setSort] = useState<'count' | 'money'>('count');
  const rows = useMemo(() => {
    const r = campaigns(all, leads);
    return sort === 'money' ? [...r].sort((a, b) => b.revenue - a.revenue || b.count - a.count) : r;
  }, [all, leads, sort]);
  const without = useMemo(() => all.filter((p) => !campaignOf(p, leads)).length, [all, leads]);
  const red = health.last7 > 0;

  return (
    <section className={`card${red ? ' alert' : ''}`} id="tracking" aria-labelledby="tracking-h">
      <h2 id="tracking-h">תקינות מעקב קמפיינים</h2>
      {red && <TrackingAlert />}
      <Stats items={[
        { label: 'אנשים עם קמפיין שלא מולא', value: nf.format(health.total), sub: 'מאז 1/9' },
        { label: 'ב-7 הימים האחרונים', value: nf.format(health.last7), sub: red ? 'צריך לתקן' : 'תקין' },
      ]} />
      {health.byValue.length > 0 && (
        <BarList items={health.byValue.map((x) => ({ name: x.name, count: x.count }))} extra={(n) => { const x = health.byValue.find((y) => y.name === n); return x ? `7 ימים: ${nf.format(x.last7)}` : null; }} />
      )}
      <p className="hint tight">
        קמפיין שלא מולא: ב-<bdi>utm_campaign</bdi> של האדם כתוב שם של שדה במקום שם הקמפיין, למשל <bdi>{'{campaignname}'}</bdi> או <bdi>campaignname</bdi>.
        7 הימים נספרים לפי תאריך הכניסה, עד עדכון הנתונים.
      </p>

      <div className="box">
        <div className="cardhead">
          <h3>קמפיינים מובילים</h3>
          <Chips value={sort} onChange={setSort} label="סדר" options={[{ id: 'count', label: 'לפי רכישות' }, { id: 'money', label: 'לפי סכום' }]} />
        </div>
        <Legend items={[{ label: 'רכישות של הבוט', color: '--series-1' }, { label: 'שאר הרכישות', color: '--series-2' }]} />
        <BarTable
          headers={['קמפיין', '', 'רכישות', 'סכום', 'של הבוט']}
          rows={rows.map((c) => ({
            key: c.name,
            name: c.name,
            title: c.name,
            segments: [{ value: c.bot, color: '--series-1', label: 'של הבוט' }, { value: c.count - c.bot, color: '--series-2', label: 'שאר הרכישות' }],
            cells: [nf.format(c.count), money.format(c.revenue), `${nf.format(c.bot)} (${pct(c.bot, c.count)})`],
          }))}
        />
        <p className="hint tight">
          הקמפיין של רכישה: <bdi>utm_campaign</bdi> של הרכישה, ואם הוא ריק, של האדם. {nf.format(without)} רכישות בטווח בלי קמפיין בכלל. <bdi>utm_campaign</bdi> של הרכישה
          נרשם מ-30/10.
        </p>
      </div>
    </section>
  );
}
