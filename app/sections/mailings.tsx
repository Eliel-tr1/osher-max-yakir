'use client';

import { useMemo, useState } from 'react';
import type { MailingPurchase, MailingWave } from '@/lib/leads/types';
import { mailingCampaigns, mailingView, SPOOKY } from '@/lib/metrics';
import { BarList, Columns, FunnelStrip, Info, ListBlock, SimpleTable, Stats, fmtSheetDay, money, nf } from '../charts';
import { useLinkNote } from '../auth';
import { buysCount, buysSum, MailList } from '../lists';
import { Chips } from './shared';

const n = (v: number | null) => (v === null ? '-' : nf.format(v));
const eur = (v: number | null) => (v === null ? '-' : money.format(v));

/**
 * קמפיין דיוור, מהלשוניות "דיוורים" ו"דיוורים - סיכום" (הנחיית המנהל, 31/10/2026).
 * קמפיינים עתידיים נכנסים לאותן לשוניות, והעמודה "קמפיין" היא הבחירה. לא מושפע מטווח התאריכים.
 */
export function MailingsSection({ mailings, waves }: { mailings: MailingPurchase[]; waves: MailingWave[] }) {
  const names = useMemo(() => mailingCampaigns(waves, mailings), [waves, mailings]);
  const [picked, setPicked] = useState<string | null>(null);
  const note = useLinkNote();
  const campaign = picked && names.includes(picked) ? picked : names[names.length - 1];
  const v = useMemo(() => (campaign ? mailingView(campaign, waves, mailings) : null), [campaign, waves, mailings]);
  if (!campaign || !v) return null;
  const t = v.total;
  const rows = [...v.waves, ...(v.others ? [v.others] : []), t];

  return (
    <section className="card" id="mail" aria-labelledby="mail-h">
      <div className="cardhead">
        <h2 id="mail-h" dir="auto">קמפיין {campaign}</h2>
        {names.length > 1 && <Chips value={campaign} onChange={setPicked} label="קמפיין" options={names.map((x) => ({ id: x, label: x }))} />}
      </div>
      <FunnelStrip
        steps={[
          { label: 'נשלחו', value: t.sent ?? 0, sub: 'אנשים' },
          { label: 'נמסרו', value: t.delivered ?? 0, sub: `לא נמסרו ${n(t.undelivered)}` },
          { label: 'קנו אחרי השליחה', value: t.buyers ?? 0, sub: `${n(t.purchases)} רכישות · ${eur(t.amount)}` },
          { label: 'קנו דרך הקישור', value: v.linkBuyers, sub: `${n(t.viaLinkPurchases)} רכישות · ${eur(t.viaLinkAmount)}` },
        ]}
      />
      <p className="hint tight">
        איך לקרוא{' '}
        <Info>
          לא נמסרו: <bdi>WhatsApp</bdi> לא מסר את ההודעה, בעיקר בגלל מגבלת התדירות של <bdi>Meta</bdi> על הודעות שיווק. רכישה אחרי השליחה של נמען היא לא בהכרח בזכות
          הדיוור. רכישה דרך קישור הקמפיין (<bdi>utm_source = vitrue</bdi>) היא בוודאות מהדיוור.
        </Info>
      </p>
      <Stats items={[
        { label: 'רכישות של הבוט', value: n(t.bot), ring: t.bot !== null && t.purchases ? t.bot / t.purchases : null, sub: 'מרכישות הנמענים' },
      ]} />

      <h3>לפי גל</h3>
      <Columns
        labels={v.waves.map((w) => w.wave)}
        values={v.waves.map((w) => [w.delivered ?? 0, w.undelivered ?? 0])}
        series={[{ key: 'delivered', label: 'נמסרו', color: '--bot' }, { key: 'undelivered', label: 'לא נמסרו', color: '--notbot' }]}
        labelEvery={1}
      />

      <h3>קופונים ברכישות של הנמענים</h3>
      <BarList
        items={[
          { name: `${SPOOKY} · קופון האתר להאלווין`, count: v.coupons.spooky },
          { name: 'קופון אחר', count: v.coupons.other },
          { name: 'בלי קופון', count: v.coupons.none },
        ]}
        max={3}
        color="--bot"
      />

      <ListBlock
        note={note}
        items={[
          {
            id: 'waves', title: 'טבלת הגלים', count: `${nf.format(v.waves.length)} גלים`,
            render: () => (
              <SimpleTable
                headers={['גל', 'תאריך שליחה', 'נשלחו', 'נמסרו', 'קונים', 'רכישות', 'סכום', 'רכישות דרך הקישור']}
                rows={rows.map((w) => ({
                  key: w.wave,
                  cells: [w.wave, fmtSheetDay(w.sentDay), n(w.sent), n(w.delivered), n(w.buyers), n(w.purchases), eur(w.amount), w.viaLinkPurchases === null ? '-' : `${nf.format(w.viaLinkPurchases)} · ${eur(w.viaLinkAmount)}`],
                }))}
              />
            ),
          },
          { id: 'recipients', title: 'רכישות של נמענים אחרי השליחה', count: buysCount(v.recipients), sum: buysSum(v.recipients), render: () => <MailList rows={v.recipients} /> },
          ...(v.nonRecipients.length
            ? [{ id: 'others', title: 'רכישות של מי שלא היה נמען, או קנה לפני השליחה', count: buysCount(v.nonRecipients), sum: buysSum(v.nonRecipients), render: () => <MailList rows={v.nonRecipients} /> }]
            : []),
        ]}
      />
    </section>
  );
}
