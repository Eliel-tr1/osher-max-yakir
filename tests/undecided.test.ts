import { describe, expect, it } from 'vitest';
import { ALL, leadFilter, purchasesIn } from '../lib/filters';
import { inquiryView, type Scope } from '../lib/insights';
import type { InquiryRow, Purchase } from '../lib/leads/types';
import { botBreakdown } from '../lib/metrics';
import { NO_REASON_YET, undecidedReason, undecidedRows, undecidedView } from '../lib/undecided';

/** #38: "עוד לא הוכרעו" ותיקון הסינון של תובנות השיחה */
function buy(p: Partial<Purchase>): Purchase {
  return {
    at: '2026-10-22T07:00:00.000Z', lead: null, product: null, amount: null, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: null,
    reason: null, coupon: null, buyer: 0, person: 0, ...p,
  };
}
const lead = (i: number, sourceGroup: string | null, process: string | null) => ({ i, sourceGroup, process });
const all = { from: null, to: null };

describe('page filter (source / process)', () => {
  const leads = [lead(0, 'בוט וואטסאפ', 'ראשי'), lead(1, 'גוגל', 'ראשי'), lead(2, 'בוט וואטסאפ', 'מבחן')];

  it('no filter: keep is null, so nothing is dropped', () => {
    const f = leadFilter(leads, ALL, ALL);
    expect(f).toMatchObject({ keep: null, active: false });
    expect(f.scoped).toHaveLength(3);
  });

  it('with a filter: keep holds the remaining leads', () => {
    const f = leadFilter(leads, 'בוט וואטסאפ', ALL);
    expect(f.active).toBe(true);
    expect([...f.keep!]).toEqual([0, 2]);
    expect([...leadFilter(leads, 'בוט וואטסאפ', 'מבחן').keep!]).toEqual([2]);
  });

  it('the insight cards follow the filter (it used to be inverted)', () => {
    const inq = (lead: number | null): InquiryRow => ({ at: '2026-10-20T07:00:00.000Z', lead, who: lead ?? 99, category: 'הפעלת חשבון' });
    const rows = [inq(0), inq(1), inq(null)];
    const scope = (source: string): Scope => ({ range: all, keep: leadFilter(leads, source, ALL).keep, testLeads: new Set() });
    // בלי סינון: כל הפניות, גם בלי ליד
    expect(inquiryView(rows, scope(ALL)).categorized).toBe(3);
    // עם סינון: רק הפניות של הלידים שנשארו
    expect(inquiryView(rows, scope('גוגל')).categorized).toBe(1);
  });

  it('purchases: range always, leads only with a filter', () => {
    const ps = [
      buy({ lead: 0, at: '2026-10-01T10:00:00.000Z' }),
      buy({ lead: 1, at: '2026-10-22T10:00:00.000Z' }),
      buy({ lead: null, at: '2026-10-22T11:00:00.000Z' }),
    ];
    const oct20 = { from: new Date('2026-10-20T00:00:00.000Z'), to: null };
    expect(purchasesIn(ps, all, null)).toHaveLength(3);
    expect(purchasesIn(ps, oct20, null)).toEqual([ps[1], ps[2]]);
    expect(purchasesIn(ps, all, leadFilter(leads, 'גוגל', ALL).keep)).toEqual([ps[1]]);
  });
});

describe('undecided list', () => {
  const ps = [
    buy({ at: '2026-10-20T07:00:00.000Z', bot: null, amount: 100, buyer: 1, reason: "הצ'אט עוד לא נאסף" }),
    buy({ at: '2026-10-23T07:00:00.000Z', bot: null, amount: 50, buyer: 2, reason: 'לא נמצא ב-CloudChat' }),
    buy({ at: '2026-10-22T07:00:00.000Z', bot: null, amount: 30, buyer: 1, reason: "הצ'אט עוד לא נאסף" }),
    buy({ at: '2026-10-21T07:00:00.000Z', bot: null, amount: null, buyer: 3 }),
    buy({ at: '2026-10-24T07:00:00.000Z', bot: null, amount: -5, buyer: 4 }),
    // הוכרעו: לא ברשימה
    buy({ bot: 'yes', amount: 500, buyer: 5, reason: 'קופון הבוט' }),
    buy({ bot: 'no', amount: 70, buyer: 6, reason: 'לא כתב לבוט' }),
    // משורת ליד: עוד לא הוכרע, אבל לא ברשימה
    buy({ bot: null, fromLead: true, amount: 200, buyer: 7, lead: 3 }),
  ];
  const v = undecidedView(ps);

  it('lists only purchase-tab rows with an empty "של הבוט", newest first', () => {
    expect(v.rows.map((p) => p.at.slice(0, 10))).toEqual(['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20']);
    expect(v.rows.every((p) => p.bot === null && !p.fromLead)).toBe(true);
    expect(v.tab).toEqual({ purchases: 5, paid: 180, buyers: 4 });
  });

  it('counts lead-row purchases apart, and the total matches the rest of the page', () => {
    expect(v.fromLead).toEqual({ purchases: 1, paid: 200 });
    expect(v.total).toEqual({ purchases: 6, paid: 380 });
    const open = botBreakdown(ps).open;
    expect(v.total).toEqual({ purchases: open.purchases, paid: open.paid });
  });

  it('groups by reason (empty = its own chip) and filters the list by a chip', () => {
    expect(v.reasons).toEqual([
      // אותה כמות: לפי הא"ב
      { name: NO_REASON_YET, purchases: 2, paid: 0 },
      { name: "הצ'אט עוד לא נאסף", purchases: 2, paid: 130 },
      { name: 'לא נמצא ב-CloudChat', purchases: 1, paid: 50 },
    ]);
    expect(v.reasons.reduce((s, r) => s + r.purchases, 0)).toBe(v.tab.purchases);
    expect(undecidedReason({ reason: null })).toBe(NO_REASON_YET);
    expect(undecidedRows(v, "הצ'אט עוד לא נאסף").map((p) => p.amount)).toEqual([30, 100]);
    expect(undecidedRows(v, null)).toBe(v.rows);
  });

  it('respects the page range and filter (it gets the purchases after both)', () => {
    const leads = [lead(0, 'בוט וואטסאפ', null), lead(1, 'גוגל', null)];
    const xs = [
      buy({ lead: 0, at: '2026-10-22T07:00:00.000Z', amount: 10 }),
      buy({ lead: 1, at: '2026-10-22T08:00:00.000Z', amount: 20 }),
      buy({ lead: 1, at: '2026-09-01T08:00:00.000Z', amount: 40 }),
    ];
    const oct = { from: new Date('2026-10-01T00:00:00.000Z'), to: null };
    expect(undecidedView(purchasesIn(xs, oct, null)).tab.paid).toBe(30);
    expect(undecidedView(purchasesIn(xs, oct, leadFilter(leads, 'גוגל', ALL).keep)).tab.paid).toBe(20);
    expect(undecidedView(purchasesIn(xs, all, leadFilter(leads, 'גוגל', ALL).keep)).tab.paid).toBe(60);
  });
});
