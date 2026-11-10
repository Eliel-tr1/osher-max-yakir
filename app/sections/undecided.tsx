'use client';

import { useContext, useMemo, useState } from 'react';
import type { AnalysisRow, Purchase } from '@/lib/leads/types';
import { NO_PRODUCT } from '@/lib/metrics';
import { undecidedReason, undecidedRows, undecidedView } from '@/lib/undecided';
import { ChatLink, useAuth, useLinkNote } from '../auth';
import { Fold, fmtDateTime, Info, money, MoreTable, nf } from '../charts';
import { DataContext } from '../lists';

/**
 * "עוד לא הוכרעו" (#38, בקשת המנהל 10/11/2026): כל רכישה מלשונית "רכישות" שהעמודה "של הבוט" שלה ריקה, בטווח ובסינון של הדף,
 * מהחדשה לישנה. צ'יפ של סיבה מסנן את הרשימה. שם וקישור לשיחה רק אחרי כניסה.
 * רכישות משורת ליד אין להן תא "של הבוט": הן נספרות בשורה אחת ולא ברשימה.
 */
export function UndecidedSection({ all, analysis, open, onToggle }: {
  /** כל הרכישות בטווח (אחרי סינון המקור והתהליך) */
  all: Purchase[];
  /** "ניתוח שיחות", לשם של הקונה אחרי כניסה */
  analysis: AnalysisRow[] | null;
  open: boolean;
  onToggle: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const note = useLinkNote();
  const { status, stale, name } = useAuth();
  const { purchaseIndex } = useContext(DataContext);
  const links = status === 'in' && !stale;
  const v = useMemo(() => undecidedView(all), [all]);
  // השם של הקונה: מהשורה שלו ב"ניתוח שיחות" (באותו ליד). בלי שורה כזו, בלי שם
  const nameRow = useMemo(() => {
    const m = new Map<number, number>();
    (analysis ?? []).forEach((r, i) => { if (r.lead !== null && !m.has(r.lead)) m.set(r.lead, i); });
    return m;
  }, [analysis]);
  // סיבה שנבחרה ולא קיימת בטווח החדש: כל הסיבות
  const picked = reason !== null && v.reasons.some((r) => r.name === reason) ? reason : null;
  const rows = undecidedRows(v, picked);
  const headers = ['תאריך', 'מוצר', 'סכום', 'סיבה', ...(links ? ['שם', 'שיחה'] : [])];

  return (
    <Fold
      id="undecided" title="עוד לא הוכרעו" open={open} onToggle={onToggle}
      seg={v.reasons.map((r) => r.purchases)}
      stats={[
        { label: 'רכישות', value: nf.format(v.tab.purchases) },
        { label: 'סכום', value: money.format(v.tab.paid) },
        ...(v.fromLead.purchases ? [{ label: 'משורות ליד', value: nf.format(v.fromLead.purchases) }] : []),
      ]}
      info={
        <>
          רכישות בלשונית &quot;רכישות&quot; שהעמודה &quot;של הבוט&quot; שלהן עוד ריקה: הסוכן של המנהל עוד לא הכריע אותן (למשל הצ&apos;אט עוד לא נאסף, או שאיש הקשר
          לא נמצא ב-CloudChat). &quot;סיבה&quot; כמו שכתוב בלשונית. רכישה שנלקחה משורת ליד אין לה תא &quot;של הבוט&quot;, ולכן היא לא ברשימה.
        </>
      }
    >
      <p className="undsum">
        <b>{nf.format(v.tab.purchases)}</b> רכישות, <b>{money.format(v.tab.paid)}</b>, של {nf.format(v.tab.buyers)} קונים.
        {v.fromLead.purchases ? (
          <>
            {' '}ועוד {nf.format(v.fromLead.purchases)} רכישות משורות לידים ({money.format(v.fromLead.paid)}) שאי אפשר להכריע. יחד {nf.format(v.total.purchases)} רכישות,{' '}
            {money.format(v.total.paid)}: המספר של &quot;עוד לא הוכרעו&quot; בשאר הדף.
          </>
        ) : null}
      </p>
      {v.rows.length === 0 ? (
        <p className="empty">אין רכישות שעוד לא הוכרעו בטווח הזה</p>
      ) : (
        <>
          <h3>
            לפי סיבה <Info>לחיצה על סיבה מציגה רק את הרכישות שלה. לחיצה נוספת מחזירה את כולן.</Info>
          </h3>
          <div className="chipsline" role="group" aria-label="סינון לפי סיבה">
            {v.reasons.map((r) => (
              <button key={r.name} type="button" aria-pressed={picked === r.name} onClick={() => setReason(picked === r.name ? null : r.name)} title={money.format(r.paid)}>
                {r.name} <b>{nf.format(r.purchases)}</b>
              </button>
            ))}
          </div>
          <p className="listsnote">
            {picked ?? 'כל הסיבות'} · {nf.format(rows.length)} רכישות{note ? ` · ${note}` : ''}
          </p>
          <MoreTable
            headers={headers}
            rows={rows.map((p, n) => {
              const i = purchaseIndex.get(p);
              const row = p.lead === null ? undefined : nameRow.get(p.lead);
              return {
                key: `${i ?? 'x'}-${n}`,
                cells: [
                  fmtDateTime(p.at), p.product ?? NO_PRODUCT, p.amount === null ? '-' : money.format(p.amount), undecidedReason(p),
                  ...(links ? [(row !== undefined && name('analysis', row)) || '-', <ChatLink key="l" kind="purchase" i={i} label="פתח שיחה ב-CloudChat" />] : []),
                  // TODO(#38): כאן ייכנסו הכפתורים "שייך לבוט" (ירוק) ו"לא שייך לבוט" (אדום), אחרי שתהיה דרך כתיבה שהסוכן של המנהל מכבד.
                ],
              };
            })}
          />
        </>
      )}
    </Fold>
  );
}
