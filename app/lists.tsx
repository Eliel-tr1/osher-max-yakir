'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Lead, MailingPurchase, Purchase } from '@/lib/leads/types';
import { botSide, campaignOf, NO_PRODUCT, normalizeMode, reasonOf, type PopupPerson } from '@/lib/metrics';
import { ChatLink, useAuth, type LinkKind } from './auth';
import { fmtDate, fmtDateTime, money, MoreTable, nf } from './charts';

/** מה שהרשימות צריכות מהקובץ: הלידים (לקמפיין של האדם), והמיקום של כל רכישה בקובץ (לקישור לשיחה) */
interface DataLookup {
  leads: Lead[];
  purchaseIndex: Map<Purchase, number>;
  mailingIndex: Map<MailingPurchase, number>;
}

export const DataContext = createContext<DataLookup>({ leads: [], purchaseIndex: new Map(), mailingIndex: new Map() });

export function DataProvider({ value, children }: { value: DataLookup; children: ReactNode }) {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useLinks(): boolean {
  const { status, stale } = useAuth();
  return status === 'in' && !stale;
}

const paidOf = (xs: { amount: number | null }[]) => xs.reduce((s, x) => s + (x.amount && x.amount > 0 ? x.amount : 0), 0);

/** "587 רכישות" */
export function buysCount(xs: unknown[]): string {
  return `${nf.format(xs.length)} רכישות`;
}

/** "€60,164" */
export function buysSum(xs: { amount: number | null }[]): string {
  return money.format(paidOf(xs));
}

/** "481 אנשים" */
export function peopleCount(xs: unknown[]): string {
  return `${nf.format(xs.length)} אנשים`;
}

const HEAD = ['תאריך', 'מוצר', 'סכום', 'סיבה', 'קמפיין'];

/**
 * רשימת רכישות: תאריך, מוצר, סכום, סיבה וקמפיין, מהחדש לישן. בלי שמות, טלפונים או קוד מזהה.
 * כפתור "לשיחה" רק למי שנכנס (#6).
 */
export function BuyList({ purchases }: { purchases: Purchase[] }) {
  const { leads, purchaseIndex } = useContext(DataContext);
  const links = useLinks();
  const rows = [...purchases].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <MoreTable
      headers={links ? [...HEAD, ''] : HEAD}
      rows={rows.map((p, n) => {
        const i = purchaseIndex.get(p);
        return { key: `${i ?? 'x'}-${n}`, cells: [...buyCells(p.at, p.product, p.amount, reasonCell(p), campaignOf(p, leads)), ...(links ? [<ChatLink key="l" kind="purchase" i={i} />] : [])] };
      })}
    />
  );
}

/** רשימת רכישות מלשונית "דיוורים" */
export function MailList({ rows: ms }: { rows: MailingPurchase[] }) {
  const { mailingIndex } = useContext(DataContext);
  const links = useLinks();
  const rows = [...ms].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <MoreTable
      headers={links ? [...HEAD, ''] : HEAD}
      rows={rows.map((m, n) => {
        const i = mailingIndex.get(m);
        return { key: `${i ?? 'x'}-${n}`, cells: [...buyCells(m.at, m.product, m.amount, reasonCell(m), m.campaign), ...(links ? [<ChatLink key="l" kind={'mailing' as LinkKind} i={i} />] : [])] };
      })}
    />
  );
}

/** רכישה של הבוט בולטת ברשימה: כחול, נקודה ומשקל, כדי שלא תהיה תלויה בצבע בלבד (#34) */
function reasonCell(p: { reason: string | null; bot: 'yes' | 'no' | null }): ReactNode {
  const text = reasonOf(p);
  return botSide(p) === 'yes' ? <span key="r" className="isbot">● {text}</span> : text;
}

function buyCells(at: string, product: string | null, amount: number | null, reason: ReactNode, campaign: string | null): ReactNode[] {
  return [fmtDateTime(at), product ?? NO_PRODUCT, amount === null ? '-' : money.format(amount), reason, campaign ?? '-'];
}

function conversation(l: Lead): string {
  if (l.aiConversation === 'yes') return normalizeMode(l.mode) ?? 'כן';
  if (l.aiConversation === 'no') return 'לא';
  return 'עוד לא נסרק';
}

/** רשימת אנשים: תאריך כניסה, הודעות, שיחה, רכישות אחרי הכניסה וסכום. בלי פרטים מזהים */
export function PeopleList({ people }: { people: PopupPerson[] }) {
  const links = useLinks();
  const rows = [...people].sort((a, b) => b.entry.localeCompare(a.entry));
  const head = ['תאריך כניסה', 'הודעות', 'שיחה', 'רכישות אחרי הכניסה', 'סכום'];
  return (
    <MoreTable
      headers={links ? [...head, ''] : head}
      rows={rows.map((x, n) => ({
        key: `${x.lead.i}-${n}`,
        cells: [
          fmtDate(x.entry), x.lead.messages === null ? '-' : nf.format(x.lead.messages), conversation(x.lead), nf.format(x.after.length),
          x.after.length ? money.format(paidOf(x.after)) : '-', ...(links ? [<ChatLink key="l" kind="lead" i={x.lead.i} />] : []),
        ],
      }))}
    />
  );
}

