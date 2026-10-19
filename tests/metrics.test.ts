import { describe, expect, it } from 'vitest';
import { demoLeadsFile } from '../lib/leads/demo';
import type { Lead } from '../lib/leads/types';
import { countBy, inRange, matrixByMonth, perDay, productStats, purchases, removedIn, summarize } from '../lib/metrics';

function lead(p: Partial<Lead>): Lead {
  return {
    at: '2026-10-01T07:00:00.000Z', source: null, process: null, status: null, qStatus: null, answered: false, aiConversation: null,
    step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null, ...p,
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
  it('counts converted as paid by the bot and payment as paid not necessarily by the bot', () => {
    expect(summarize(sample)).toEqual({
      leads: 6, startedJourney: 0, aiAnalyzed: 0, realConversations: 0, passed: 0, failed: 0, purchased: 5, purchasedOfStarted: 0,
      paidBot: 3, paidOther: 2, totalPaid: 450, revenueBot: 400, revenueOther: 50, avgDealBot: 200, avgDealAll: 150,
    });
  });

  it('counts passed, failed, conversation starts (column I), and purchases among those who started', () => {
    const s = summarize([
      lead({ status: 'עבר', answered: true, qStatus: 'converted', amount: 10 }),
      lead({ status: 'לא עבר', answered: true }),
      lead({ status: 'לא עבר', qStatus: 'payment', amount: 5 }),
    ]);
    expect([s.passed, s.failed, s.startedJourney, s.purchased, s.purchasedOfStarted]).toEqual([1, 2, 2, 2, 1]);
  });

  it('keeps the agent verdict (column BD) apart from the technical start: real, not real, not read yet', () => {
    const s = summarize([
      lead({ answered: true, aiConversation: 'yes' }),
      lead({ answered: true, aiConversation: 'no' }),
      lead({ answered: true }),
      lead({ aiConversation: 'no' }),
    ]);
    expect([s.startedJourney, s.aiAnalyzed, s.realConversations]).toEqual([3, 3, 1]);
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
      { name: 'P1', count: 2, revenue: 50, avg: 50, min: 50, max: 50 },
      { name: 'T1', count: 2, revenue: 400, avg: 200, min: 100, max: 300 },
      { name: 'T2', count: 1, revenue: 0, avg: null, min: null, max: null },
    ]);
  });

  it('builds a month by name table with exact counts, in Israel time', () => {
    const m = matrixByMonth(purchases(sample), (p) => p.product, (p) => p.at);
    expect(m.months).toEqual(['2026-09', '2026-10']);
    expect(m.rows.find((r) => r.name === 'T1')).toEqual({ name: 'T1', total: 2, byMonth: [1, 1] });
    expect(m.monthTotals).toEqual([1, 4]);
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

describe('breakdowns', () => {
  const ls = [
    lead({ status: 'עבר', step: 3, qStatus: 'converted', amount: 100, mode: 'מכירותי' }),
    lead({ status: 'עבר', step: 10, qStatus: 'finished', mode: 'שירות' }),
    lead({ status: 'לא עבר', step: 1, qStatus: 'payment', amount: 50 }),
    lead({ status: 'לא עבר', mode: 'משהו חדש' }),
    lead({}),
  ];

  it('groups by test result in a fixed order, with questionnaire, purchases, paid total and conversation mode', async () => {
    const { breakdown, resultOf, RESULT_ORDER } = await import('../lib/metrics');
    const b = breakdown(ls, resultOf, RESULT_ORDER);
    expect(b.modes).toEqual(['מכירותי', 'משהו חדש', 'שירות', 'לא סווג']);
    expect(b.rows.map((r) => [r.name, r.leads, r.startedQ, r.finishedQ, r.purchased, r.totalPaid])).toEqual([
      ['עבר', 2, 2, 2, 1, 100],
      ['לא עבר', 2, 1, 0, 1, 50],
      ['בלי סטטוס', 1, 0, 0, 0, 0],
    ]);
    expect(b.rows[0].byMode).toEqual([1, 0, 1, 0]);
    expect(b.rows[1].byMode).toEqual([0, 1, 0, 1]);
    expect(b.total).toMatchObject({ leads: 5, passed: 2, failed: 2, purchased: 2, totalPaid: 150 });
  });

  it('counts everyone who finished the questionnaire as having started it, even when column K is empty', async () => {
    const { breakdown } = await import('../lib/metrics');
    const b = breakdown([lead({ qStatus: 'finished' }), lead({ qStatus: 'converted' }), lead({ qStatus: 'started' }), lead({ qStatus: 'payment' })], () => 'x');
    expect([b.total.startedQ, b.total.finishedQ]).toEqual([3, 2]);
  });

  it('gives each test its pass rate, and pass and fail over time', async () => {
    const { testStats, passFailOverTime } = await import('../lib/metrics');
    const t = testStats([
      lead({ test: 'A', status: 'עבר' }), lead({ test: 'A', status: 'לא עבר' }), lead({ test: 'A', status: 'לא עבר' }), lead({ test: 'A' }),
      lead({ test: 'B' }),
    ]);
    expect(t[0]).toEqual({ name: 'A', total: 4, passed: 1, failed: 2, passRate: 1 / 3 });
    expect(t[1].passRate).toBeNull();
    const days = passFailOverTime([
      lead({ at: '2026-10-01T07:00:00.000Z', status: 'עבר' }), lead({ at: '2026-10-03T07:00:00.000Z', status: 'לא עבר' }),
    ], 'day');
    expect(days).toEqual([{ key: '2026-10-01', passed: 1, failed: 0 }, { key: '2026-10-02', passed: 0, failed: 0 }, { key: '2026-10-03', passed: 0, failed: 1 }]);
  });
});

describe('time buckets', () => {
  it('starts weeks on Sunday, in Israel time, and rolls months over the year', async () => {
    const { bucketOf, timeSeries } = await import('../lib/metrics');
    // יום שני 19/10/2026 -> השבוע של יום ראשון 18/10
    expect(bucketOf('2026-10-19T09:00:00.000Z', 'week')).toBe('2026-10-18');
    // שבת 24/10 בלילה, 23:30 בישראל, עדיין באותו שבוע
    expect(bucketOf('2026-10-24T20:30:00.000Z', 'week')).toBe('2026-10-18');
    expect(bucketOf('2026-10-24T20:30:00.000Z', 'month')).toBe('2026-10');
    const s = timeSeries(['2025-12-10T10:00:00.000Z', '2026-02-01T10:00:00.000Z'], (x) => x, 'month', 1, () => [1]);
    expect(s).toEqual([{ key: '2025-12', values: [1] }, { key: '2026-01', values: [0] }, { key: '2026-02', values: [1] }]);
  });

  it('picks day up to two months, week up to half a year, then month', async () => {
    const { autoBucket } = await import('../lib/metrics');
    const span = (days: number) => [lead({ at: '2026-01-01T10:00:00.000Z' }), lead({ at: new Date(Date.parse('2026-01-01T10:00:00.000Z') + (days - 1) * 86_400_000).toISOString() })];
    expect(autoBucket(span(62))).toBe('day');
    expect(autoBucket(span(63))).toBe('week');
    expect(autoBucket(span(182))).toBe('week');
    expect(autoBucket(span(183))).toBe('month');
    expect(autoBucket([])).toBe('day');
  });
});

describe('conversation mode (written by the agent)', () => {
  it('shows every category as written, most common first, with only spaces unified, and unclassified last', async () => {
    const { modesOf, breakdown } = await import('../lib/metrics');
    const ls = [lead({ mode: 'מכירתי' }), lead({ mode: ' מכירתי ' }), lead({ mode: 'פניית  שירות' }), lead({ mode: 'טכני' }), lead({ mode: 'טכני' }), lead({ mode: 'טכני' }), lead({})];
    expect(modesOf(ls)).toEqual(['טכני', 'מכירתי', 'פניית שירות', 'לא סווג']);
    expect(breakdown(ls, () => 'x').total.byMode).toEqual([3, 2, 1, 1]);
  });

  it('counts conversation starts, agent reads and real conversations per group', async () => {
    const { breakdown } = await import('../lib/metrics');
    const b = breakdown([lead({ answered: true, aiConversation: 'yes' }), lead({ answered: true, aiConversation: 'no' }), lead({})], () => 'x');
    expect([b.total.started, b.total.analyzed, b.total.real]).toEqual([2, 2, 1]);
  });
});
