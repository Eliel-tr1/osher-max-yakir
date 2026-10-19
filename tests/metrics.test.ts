import { describe, expect, it } from 'vitest';
import { demoLeadsFile } from '../lib/leads/demo';
import type { Lead } from '../lib/leads/types';
import { countBy, inRange, matrixByMonth, perDay, productStats, purchases, removedIn, summarize } from '../lib/metrics';

function lead(p: Partial<Lead>): Lead {
  return {
    at: '2026-10-01T07:00:00.000Z', source: null, process: null, status: null, qStatus: null, answered: false,
    step: null, score: null, test: null, product: null, amount: null, removedAt: null, ...p,
  };
}

const sample = [
  lead({ qStatus: 'converted', amount: 100, test: 'T1' }),
  lead({ qStatus: 'converted', amount: 300, test: 'T1', at: '2026-09-15T07:00:00.000Z' }),
  lead({ qStatus: 'converted', amount: null, test: 'T2' }),
  lead({ qStatus: 'payment', amount: 50, product: 'P1' }),
  lead({ qStatus: 'payment', amount: 0, product: 'P1' }),
  lead({}),
];

describe('summarize', () => {
  it('splits bot payments (converted) from other payments (amount without converted)', () => {
    expect(summarize(sample)).toEqual({
      leads: 6, paidBot: 3, paidOther: 1, revenueBot: 400, revenueOther: 50, avgDealBot: 200, avgDealAll: 150,
    });
  });

  it('has no averages when nothing was paid', () => {
    const s = summarize([lead({})]);
    expect(s.avgDealBot).toBeNull();
    expect(s.avgDealAll).toBeNull();
  });
});

describe('purchases and products', () => {
  it('names a purchase by product, then by test, and gives count, average, min and max', () => {
    const stats = productStats(purchases(sample));
    expect(stats).toEqual([
      { name: 'T1', count: 2, revenue: 400, avg: 200, min: 100, max: 300 },
      { name: 'P1', count: 1, revenue: 50, avg: 50, min: 50, max: 50 },
      { name: 'T2', count: 1, revenue: 0, avg: null, min: null, max: null },
    ]);
  });

  it('builds a month by name table with exact counts, in Israel time', () => {
    const m = matrixByMonth(purchases(sample), (p) => p.product, (p) => p.at);
    expect(m.months).toEqual(['2026-09', '2026-10']);
    expect(m.rows[0]).toEqual({ name: 'T1', total: 2, byMonth: [1, 1] });
    expect(m.monthTotals).toEqual([1, 3]);
    // 30/09 23:30 בישראל הוא עדיין ספטמבר, גם אם ב-UTC זה 20:30
    expect(matrixByMonth([{ at: '2026-09-30T20:30:00.000Z' }], () => 'x', (x) => x.at).months).toEqual(['2026-09']);
  });
});

describe('ranges', () => {
  it('filters by entry date, and counts removals by removal date', () => {
    const r = { from: new Date('2026-10-01T00:00:00+03:00'), to: null };
    expect(inRange(sample, r)).toHaveLength(5);
    const all = [lead({ at: '2026-09-01T07:00:00.000Z', removedAt: '2026-10-02T07:00:00.000Z' }), lead({ removedAt: '2026-09-02T07:00:00.000Z' })];
    expect(removedIn(all, r)).toBe(1);
  });

  it('fills days without leads with zero', () => {
    const days = perDay([lead({ at: '2026-10-01T07:00:00.000Z' }), lead({ at: '2026-10-03T07:00:00.000Z' })]);
    expect(days).toEqual([{ day: '2026-10-01', count: 1 }, { day: '2026-10-02', count: 0 }, { day: '2026-10-03', count: 1 }]);
  });

  it('counts by value, most common first', () => {
    expect(countBy(sample, (l) => l.test)).toEqual([{ name: 'T1', count: 2 }, { name: 'T2', count: 1 }]);
  });
});

describe('demo data', () => {
  it('is stable, invented, and has the same shape as the sheet', () => {
    const a = demoLeadsFile();
    expect(a).toEqual(demoLeadsFile());
    expect(a.origin).toBe('demo');
    expect(a.leads.every((l) => !l.product || l.product.startsWith('Demo'))).toBe(true);
    expect(summarize(a.leads).paidBot).toBeGreaterThan(0);
  });
});

describe('the data file', () => {
  it('drops empty fields and restores them', async () => {
    const { pack, unpack } = await import('../lib/leads/file');
    const f = demoLeadsFile(50);
    const text = pack(f);
    expect(text).not.toContain('null');
    expect(unpack(JSON.parse(text))).toEqual(f);
    expect(() => unpack({ version: 2 })).toThrow();
  });
});

describe('date presets', () => {
  it('uses Israel days, including the previous month and a custom inclusive range', async () => {
    const { rangeFor } = await import('../lib/ranges');
    // 19/10/2026 01:30 בישראל = 18/10 22:30 UTC
    const now = new Date('2026-10-18T22:30:00Z');
    expect(rangeFor('7d', now).from?.toISOString()).toBe('2026-10-12T21:00:00.000Z');
    expect(rangeFor('month', now).from?.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    const prev = rangeFor('prevMonth', now);
    expect([prev.from?.toISOString(), prev.to?.toISOString()]).toEqual(['2026-08-31T21:00:00.000Z', '2026-09-30T21:00:00.000Z']);
    const c = rangeFor('custom', now, { from: '2026-10-01', to: '2026-10-01' });
    expect([c.from?.toISOString(), c.to?.toISOString()]).toEqual(['2026-09-30T21:00:00.000Z', '2026-10-01T21:00:00.000Z']);
    expect(rangeFor('all', now)).toEqual({ from: null, to: null });
  });
});
