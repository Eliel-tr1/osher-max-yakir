'use client';

import type { BuyItem } from '@/lib/metrics';
import { NO_PRODUCT } from '@/lib/metrics';
import { fmtDate, fmtDateTime, money, money2, nf, PagedTable } from './charts';

/**
 * רשימה של רכישות: תאריך, מוצר, סכום, סיבה וקמפיין. בלי שמות, טלפונים, קוד מזהה או קישור לשיחה.
 * כפתור "לשיחה ב-CloudChat" יתווסף רק מאחורי כניסה מאובטחת (#6), מקובץ נתונים נפרד.
 */
export function BuyList({ items }: { items: BuyItem[] }) {
  return (
    <PagedTable
      headers={['תאריך', 'מוצר', 'סכום', 'סיבה', 'קמפיין']}
      rows={items.map((x, i) => ({
        key: `${x.at}-${i}`,
        cells: [fmtDateTime(x.at), x.product ?? NO_PRODUCT, x.amount === null ? '-' : money2.format(x.amount), x.reason, x.campaign ?? '-'],
      }))}
    />
  );
}

/** סכום וכמות לכותרת של רשימה */
export function listMeta(items: { amount: number | null }[]): string {
  const paid = items.reduce((s, x) => s + (x.amount && x.amount > 0 ? x.amount : 0), 0);
  return `${nf.format(items.length)} רכישות · ${money.format(paid)}`;
}

export interface PersonItem {
  entry: string;
  messages: number | null;
  conversation: string;
  purchases: number;
  paid: number;
}

/** רשימה של אנשים: תאריך כניסה, הודעות, שיחה, ורכישות אחרי הכניסה. בלי פרטים מזהים. */
export function PeopleList({ items }: { items: PersonItem[] }) {
  return (
    <PagedTable
      headers={['תאריך כניסה', 'הודעות', 'שיחה', 'רכישות אחרי הכניסה', 'סכום']}
      rows={[...items].sort((a, b) => b.entry.localeCompare(a.entry)).map((x, i) => ({
        key: `${x.entry}-${i}`,
        cells: [fmtDate(x.entry), x.messages === null ? '-' : nf.format(x.messages), x.conversation, nf.format(x.purchases), x.purchases ? money2.format(x.paid) : '-'],
      }))}
    />
  );
}
