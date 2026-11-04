'use client';

import { useMemo, useState } from 'react';
import type { MailingPurchase, MailingWave } from '@/lib/leads/types';
import { MAILING_WINDOW_HOURS, mailingCampaigns, mailingLevels, mailingView, SPOOKY } from '@/lib/metrics';
import { BarList, Columns, Fold, FunnelStrip, Info, ListBlock, SimpleTable, Stats, fmtSheetDay, money, nf } from '../charts';
import { useLinkNote } from '../auth';
import { buysCount, buysSum, MailList } from '../lists';
import { Chips } from './shared';

const n = (v: number | null) => (v === null ? '-' : nf.format(v));
const eur = (v: number | null) => (v === null ? '-' : money.format(v));

/**
 * קמפיין דיוור, מהלשוניות "דיוורים" ו"דיוורים - סיכום" (הנחיית המנהל, 31/10/2026).
 * קמפיינים עתידיים נכנסים לאותן לשוניות, והעמודה "קמפיין" היא הבחירה. לא מושפע מטווח התאריכים.
 * מ-3/11/2026: סגור כברירת מחדל, ושלוש רמות של רכישות נמענים עד 72 שעות אחרי השליחה.
 */
export function MailingsSection({ mailings, waves, open, onToggle }: { mailings: MailingPurchase[]; waves: MailingWave[]; open: boolean; onToggle: () => void }) {
  const names = useMemo(() => mailingCampaigns(waves, mailings), [waves, mailings]);
  const [picked, setPicked] = useState<string | null>(null);
  const note = useLinkNote();
  const campaign = picked && names.includes(picked) ? picked : names[names.length - 1];
  const v = useMemo(() => (campaign ? mailingView(campaign, waves, mailings) : null), [campaign, waves, mailings]);
  const levels = useMemo(() => mailingLevels(mailings.filter((m) => m.campaign === campaign)), [mailings, campaign]);
  if (!campaign || !v) return null;
  const counted = levels.link.length + levels.spooky.length + levels.rest.length;
  const t = v.total;
  const rows = [...v.waves, ...(v.others ? [v.others] : []), t];

  return (
    <Fold
      id="mail" title={<>דיוור <bdi>{campaign}</bdi></>} open={open} onToggle={onToggle}
      mini={[t.sent ?? 0, t.delivered ?? 0, t.buyers ?? 0, v.linkBuyers]}
      stats={[
        { label: 'נשלחו', value: n(t.sent) },
        { label: 'רכישות של נמענים', value: nf.format(counted), bot: true },
        { label: 'מהנמענים', value: money.format(levels.link.concat(levels.spooky, levels.rest).reduce((s, m) => s + (m.amount && m.amount > 0 ? m.amount : 0), 0)), bot: true },
      ]}
    >
      {names.length > 1 && <div className="cardhead"><span /><Chips value={campaign} onChange={setPicked} label="קמפיין" options={names.map((x) => ({ id: x, label: x }))} /></div>}
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

      <h3>
        רכישות של נמענים{' '}
        <Info>נספרות כל הרכישות של נמענים עד {MAILING_WINDOW_HOURS} שעות אחרי השליחה. דרך הקישור: utm_source = vitrue. רק הקוד: הקלידו SPOOKY בלי לעבור בקישור.</Info>
      </h3>
      <BarList
        items={[
          { name: 'דרך הקישור', count: levels.link.length },
          { name: `רק הקוד ${SPOOKY}`, count: levels.spooky.length },
          { name: `שאר הרכישות עד ${MAILING_WINDOW_HOURS} שעות`, count: levels.rest.length },
        ]}
        max={3}
        color="--bot"
      />

      <ListBlock
        title="פירוט"
        note={note}
        items={[
          {
            id: 'waves', title: 'לפי גל', count: `${nf.format(v.waves.length)} גלים`,
            render: () => (
              <>
                <Columns
                  labels={v.waves.map((w) => w.wave)}
                  values={v.waves.map((w) => [w.delivered ?? 0, w.undelivered ?? 0])}
                  series={[{ key: 'delivered', label: 'נמסרו', color: '--bot' }, { key: 'undelivered', label: 'לא נמסרו', color: '--notbot' }]}
                  labelEvery={1}
                />
                <SimpleTable
                  headers={['גל', 'תאריך שליחה', 'נשלחו', 'נמסרו', 'קונים', 'רכישות', 'סכום', 'רכישות דרך הקישור']}
                  rows={rows.map((w) => ({
                    key: w.wave,
                    cells: [w.wave, fmtSheetDay(w.sentDay), n(w.sent), n(w.delivered), n(w.buyers), n(w.purchases), eur(w.amount), w.viaLinkPurchases === null ? '-' : `${nf.format(w.viaLinkPurchases)} · ${eur(w.viaLinkAmount)}`],
                  }))}
                />
              </>
            ),
          },
          { id: 'recipients', title: 'רכישות של נמענים אחרי השליחה', count: buysCount(v.recipients), sum: buysSum(v.recipients), render: () => <MailList rows={v.recipients} /> },
          ...(v.nonRecipients.length
            ? [{ id: 'others', title: 'רכישות של מי שלא היה נמען, או קנה לפני השליחה', count: buysCount(v.nonRecipients), sum: buysSum(v.nonRecipients), render: () => <MailList rows={v.nonRecipients} /> }]
            : []),
        ]}
      />
    </Fold>
  );
}
