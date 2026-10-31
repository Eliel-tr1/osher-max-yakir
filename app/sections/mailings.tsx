'use client';

import { useMemo, useState } from 'react';
import type { MailingPurchase, MailingWave } from '@/lib/leads/types';
import { botSide, mailingCampaigns, mailingView, reasonOf, SPOOKY, type BuyItem } from '@/lib/metrics';
import { BarList, Columns, FunnelStrip, LazyFold, SimpleTable, Stats, money, money2, nf } from '../charts';
import { BuyList, listMeta } from '../lists';
import { Chips } from './shared';

function items(ms: MailingPurchase[]): BuyItem[] {
  return ms.map((m) => ({ at: m.at, product: m.product, amount: m.amount, reason: reasonOf(m), side: botSide(m), campaign: m.campaign }));
}

const n = (v: number | null) => (v === null ? '-' : nf.format(v));
const eur = (v: number | null) => (v === null ? '-' : money.format(v));

/**
 * קמפיין דיוור, מהלשוניות "דיוורים" ו"דיוורים - סיכום" (הנחיית המנהל, 31/10/2026).
 * קמפיינים עתידיים נכנסים לאותן לשוניות, והעמודה "קמפיין" היא הבחירה. לא מושפע מטווח התאריכים.
 */
export function MailingsSection({ mailings, waves }: { mailings: MailingPurchase[]; waves: MailingWave[] }) {
  const names = useMemo(() => mailingCampaigns(waves, mailings), [waves, mailings]);
  const [picked, setPicked] = useState<string | null>(null);
  const campaign = picked && names.includes(picked) ? picked : names[names.length - 1];
  const v = useMemo(() => (campaign ? mailingView(campaign, waves, mailings) : null), [campaign, waves, mailings]);
  if (!campaign || !v) return null;
  const t = v.total;
  const rows = [...v.waves, ...(v.others ? [v.others] : []), t];

  return (
    <section className="card" aria-labelledby="mail-h">
      <div className="cardhead">
        <h2 id="mail-h" dir="auto">קמפיין {campaign}</h2>
        {names.length > 1 && <Chips value={campaign} onChange={setPicked} label="קמפיין" options={names.map((x) => ({ id: x, label: x }))} />}
      </div>
      <Stats items={[
        { label: 'נשלחו', value: n(t.sent) },
        { label: 'לא נמסרו', value: n(t.undelivered) },
        { label: 'נמסרו', value: n(t.delivered) },
        { label: 'קונים', value: n(t.buyers) },
        { label: 'רכישות', value: n(t.purchases) },
        { label: 'סכום', value: t.amount === null ? '-' : money2.format(t.amount) },
        { label: 'דרך קישור הקמפיין', value: n(t.viaLinkPurchases), sub: t.viaLinkAmount === null ? undefined : money2.format(t.viaLinkAmount) },
        { label: 'של הבוט = כן', value: n(t.bot) },
      ]} />

      <h3>לפי גל</h3>
      <Columns
        labels={v.waves.map((w) => w.wave)}
        values={v.waves.map((w) => [w.delivered ?? 0, w.undelivered ?? 0])}
        series={[{ key: 'delivered', label: 'נמסרו', color: '--series-1' }, { key: 'undelivered', label: 'לא נמסרו', color: '--series-2' }]}
        labelEvery={1}
      />
      <SimpleTable
        headers={['גל', 'תאריך שליחה', 'נשלחו', 'נמסרו', 'קונים', 'רכישות', 'סכום', 'דרך הקישור']}
        rows={rows.map((w) => ({
          key: w.wave,
          cells: [w.wave, w.sentDay ?? '-', n(w.sent), n(w.delivered), n(w.buyers), n(w.purchases), eur(w.amount), w.viaLinkPurchases === null ? '-' : `${nf.format(w.viaLinkPurchases)} · ${eur(w.viaLinkAmount)}`],
        }))}
      />

      <h3>משפך</h3>
      <FunnelStrip
        fromPrev
        steps={[
          { label: 'נשלחו', value: t.sent ?? 0 },
          { label: 'נמסרו', value: t.delivered ?? 0 },
          { label: 'קנו אחרי השליחה', value: t.buyers ?? 0 },
          { label: 'קנו דרך הקישור', value: v.linkBuyers },
        ]}
      />

      <div className="two">
        <div>
          <h3>קופונים ברכישות של הנמענים</h3>
          <BarList
            items={[
              { name: `${SPOOKY} · קופון האתר להאלווין`, count: v.coupons.spooky },
              { name: 'קופון אחר', count: v.coupons.other },
              { name: 'בלי קופון', count: v.coupons.none },
            ]}
            max={3}
          />
        </div>
        <div className="lists">
          <h3>רשימות</h3>
          <LazyFold title="רכישות של נמענים אחרי השליחה" meta={listMeta(v.recipients)}>
            {() => <BuyList items={items(v.recipients)} />}
          </LazyFold>
          {v.nonRecipients.length > 0 && (
            <LazyFold title="רכישות של מי שלא היה נמען, או קנה לפני השליחה" meta={listMeta(v.nonRecipients)}>
              {() => <BuyList items={items(v.nonRecipients)} />}
            </LazyFold>
          )}
        </div>
      </div>

      <p className="hint">
        רכישה אחרי השליחה של נמען היא לא בהכרח בזכות הדיוור. רכישה דרך קישור הקמפיין (<bdi>utm_source = vitrue</bdi>) היא בוודאות מהדיוור.
        <br />
        לא נמסרו = <bdi>WhatsApp</bdi> לא מסר את ההודעה, בעיקר בגלל מגבלת התדירות של <bdi>Meta</bdi> על הודעות שיווק.
      </p>
    </section>
  );
}
