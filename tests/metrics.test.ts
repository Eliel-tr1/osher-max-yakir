import { describe, expect, it } from 'vitest';
import { demoLeadsFile } from '../lib/leads/demo';
import type { Lead, LeadsFile, Purchase } from '../lib/leads/types';
import {
  accountSize, annotate, autoBucket, bucketOf, buyersOf, byBot, campaigns, countBy, examSummary, examsByFamily, examsBySize, examsByPlatform, funnel,
  inRange, matrixByMonth, normalizeMode, passFailOverTime, platformOf, productFamily, productStats, purchaseSources, purchaseSummary, removedIn,
  sourceRows, summarize, testFamily, testStats, timeSeries, undecided,
} from '../lib/metrics';

function lead(p: Partial<Lead>): Lead {
  return {
    at: '2026-10-01T07:00:00.000Z', source: null, sourceGroup: null, process: null, status: null, qStatus: null, answered: false, aiConversation: null,
    step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null,
    campaign: null, messages: null, botCoupon: false, couponAt: null, firstAt: null, ...p,
  };
}
let orphan = 1000;
function buy(p: Partial<Purchase>): Purchase {
  return {
    at: '2026-10-02T07:00:00.000Z', lead: null, product: null, amount: null, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: null,
    reason: null, coupon: null, ...p, buyer: p.buyer ?? p.lead ?? orphan++,
  };
}
function file(leads: Lead[], purchases: Purchase[]): LeadsFile {
  return { version: 2, origin: 'demo', generatedAt: '', sheetRows: leads.length, purchaseRows: purchases.length, leads, purchases, mailings: null, mailingWaves: null };
}

const L = [
  lead({ qStatus: 'converted', answered: true, aiConversation: 'yes', mode: 'מכירתית', status: 'עבר', test: 'One Step Assessment - 100K - MT5' }),
  lead({ qStatus: 'payment', answered: true, aiConversation: 'no', status: 'לא עבר', test: 'Freedom Challenge - MT5 - 20k' }),
  lead({ qStatus: 'finished', answered: true, aiConversation: 'yes', mode: 'שירותי', step: 10 }),
  lead({ status: 'לקוח פעיל', test: 'One Step access- 500K - TradeLocker', sourceGroup: 'google' }),
  lead({ removedAt: '2026-10-05T07:00:00.000Z' }),
];
const P = [
  // ליד converted עם שיחה מכירתית, אבל "של הבוט" ריק: עוד לא הוכרע, ולא של הבוט
  buy({ lead: 0, amount: 100, product: 'Lightning Pro', source: "אורגני - צ'אטבוט וואטסאפ", sourceGroup: 'בוט וואטסאפ', bot: null }),
  buy({ lead: 0, amount: 50, product: 'funded activation fee', at: '2026-10-09T07:00:00.000Z', bot: 'yes' }),
  // vitrue, אבל הסוכן הכריע "לא"
  buy({ lead: 1, amount: 30, product: 'Instant', source: 'Vitrue', sourceGroup: 'Vitrue', campaign: 'halloween', bot: 'no' }),
  buy({ lead: 3, amount: null, product: 'Lightning Access', source: 'google', sourceGroup: 'google', bot: 'yes' }),
  buy({ lead: null, amount: 20, product: null, at: '2026-09-15T07:00:00.000Z', bot: null }),
];

describe('bot attribution (the column "של הבוט", 29/10)', () => {
  it('is only what the column says: yes is the bot; no and undecided are not', () => {
    expect(P.map(byBot)).toEqual([false, true, false, true, false]);
    expect(P.map(undecided)).toEqual([true, false, false, false, true]);
  });

  it('unifies the agent spelling of the conversation mode', () => {
    expect(normalizeMode(' מכירתי ')).toBe('מכירתית');
    expect(normalizeMode('שירות')).toBe('שירותית');
    expect(normalizeMode('')).toBeNull();
    expect(normalizeMode('משהו אחר')).toBe('משהו אחר');
  });
});

describe('summaries', () => {
  it('counts leads by entry, purchases by purchase date, money only where there is an amount', () => {
    const leads = annotate(file(L, P));
    expect(leads.map((l) => [l.purchases, l.spent])).toEqual([[2, 150], [1, 30], [0, 0], [1, 0], [0, 0]]);
    const s = summarize(leads, P);
    expect(s).toEqual({
      leads: 5, startedJourney: 3, aiAnalyzed: 3, realConversations: 2, salesConversations: 1,
      purchases: 5, buyers: 4, totalPaid: 200, avgDeal: 50, leadsWhoBought: 3,
    });
    expect(buyersOf([])).toBe(0);
    expect(summarize([], []).avgDeal).toBeNull();
  });

  it('splits purchases into bot, not bot and undecided, with repeat buyers and amount-less purchases', () => {
    const b = purchaseSummary(P);
    expect(b).toEqual({
      purchases: 5, buyers: 4, repeatBuyers: 1, totalPaid: 200, avgDeal: 50, noAmount: 1,
      bot: { purchases: 2, paid: 50 }, other: { purchases: 3, paid: 150 }, undecided: { purchases: 2, paid: 120 },
    });
  });

  it('builds the funnel and removals by removal date', () => {
    const leads = annotate(file(L, P));
    expect(funnel(leads)).toEqual({ leads: 5, started: 3, startedQ: 2, finishedQ: 2, bought: 3 });
    expect(removedIn(L, { from: new Date('2026-10-04T00:00:00Z'), to: null })).toBe(1);
    expect(removedIn(L, { from: null, to: new Date('2026-10-04T00:00:00Z') })).toBe(0);
    expect(inRange(P, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-05T00:00:00Z') })).toHaveLength(3);
  });
});

describe('exams', () => {
  it('counts results, overwritten results, pass rate and who bought after passing', () => {
    const leads = annotate(file(L, P));
    expect(examSummary(leads)).toEqual({ did: 3, passed: 1, failed: 1, overwritten: 1, passRate: 0.5, passedAndBought: 1 });
    expect(examSummary([]).passRate).toBeNull();
  });

  it('reads family, account size and platform from the test name', () => {
    expect(testFamily('One Step Assessment - 100K - MT5')).toBe('One Step Assessment');
    expect(testFamily('Express - No Challenge Instant Funding Plan 5K MT5')).toBe('Express / Instant');
    expect(testFamily('PTB CRYPTO challenge 10k bybit')).toBe('Crypto');
    expect(accountSize('One Step access- 500K - TradeLocker')).toBe('500K');
    expect(accountSize('Freedom Challenge - MT5 - 20k')).toBe('20K');
    expect(accountSize('Lightning Pro')).toBeNull();
    expect(platformOf('Lightning challenge 1 step - TraderLocker, 20k')).toBe('TradeLocker');
    expect(platformOf('Freedom Challenge - MT5 - 20k')).toBe('MT5');
  });

  it('breaks exams down by family, size (in order) and platform, and lists every test', () => {
    expect(examsByFamily(L).map((r) => [r.name, r.passed, r.failed, r.total])).toEqual([
      ['Freedom', 0, 1, 1], ['One Step Access', 0, 0, 1], ['One Step Assessment', 1, 0, 1],
    ]);
    expect(examsBySize(L).map((r) => r.name)).toEqual(['20K', '100K', '500K']);
    expect(examsByPlatform(L).map((r) => [r.name, r.total])).toEqual([['MT5', 2], ['TradeLocker', 1]]);
    const t = testStats([lead({ test: 'A', status: 'עבר' }), lead({ test: 'A', status: 'לא עבר' }), lead({ test: 'A', status: 'לא עבר' }), lead({ test: 'A' }), lead({ test: 'B' })]);
    expect(t).toEqual([{ name: 'A', total: 3, passed: 1, failed: 2, passRate: 1 / 3 }]);
    const days = passFailOverTime([lead({ at: '2026-10-01T07:00:00.000Z', status: 'עבר' }), lead({ at: '2026-10-03T07:00:00.000Z', status: 'לא עבר' })], 'day');
    expect(days).toEqual([{ key: '2026-10-01', passed: 1, failed: 0 }, { key: '2026-10-02', passed: 0, failed: 0 }, { key: '2026-10-03', passed: 0, failed: 1 }]);
  });
});

describe('products and sources', () => {
  it('groups products into families and gives count, revenue, bot share, average, min and max', () => {
    expect(productFamily('access funded activation fee')).toBe('דמי הפעלה (activation fee)');
    expect(productFamily('Lightning challenge 1 step - MT5, 100k')).toBe('Lightning challenge');
    expect(productFamily(null)).toBe('לא צוין');
    const stats = productStats(P);
    expect(stats.find((s) => s.name === 'Instant')).toEqual({ name: 'Instant', count: 1, revenue: 30, bot: 0, avg: 30, min: 30, max: 30 });
    expect(stats.find((s) => s.name === 'funded activation fee')).toMatchObject({ count: 1, revenue: 50, bot: 1 });
    expect(stats.find((s) => s.name === 'לא צוין')).toEqual({ name: 'לא צוין', count: 1, revenue: 20, bot: 0, avg: 20, min: 20, max: 20 });
    expect(stats.find((s) => s.name === 'Lightning Access')).toMatchObject({ count: 1, revenue: 0, avg: null });
    expect(purchaseSources(P).map((s) => [s.name, s.count])).toEqual([['לא צוין', 2], ['google', 1], ['Vitrue', 1], ['בוט וואטסאפ', 1]]);
    expect(campaigns(P)).toEqual([{ name: 'halloween', count: 1, revenue: 30, bot: 0, avg: 30, min: 30, max: 30 }]);
  });

  it('rows per source group with leads, starts, buyers and money', () => {
    const rows = sourceRows(annotate(file(L, P)));
    expect(rows).toEqual([{ name: 'לא צוין', leads: 4, started: 3, bought: 2, spent: 180 }, { name: 'google', leads: 1, started: 0, bought: 1, spent: 0 }]);
  });

  it('builds a month by name table with exact counts, in Israel time', () => {
    const m = matrixByMonth(P, (p) => p.product, (p) => p.at);
    expect(m.months).toEqual(['2026-09', '2026-10']);
    expect(m.monthTotals).toEqual([0, 4]);
    expect(matrixByMonth([{ at: '2026-09-30T20:30:00.000Z' }], () => 'x', (x) => x.at).months).toEqual(['2026-09']);
    expect(countBy(L, (l) => l.test)[0]).toEqual({ name: 'Freedom Challenge - MT5 - 20k', count: 1 });
  });
});

describe('demo data', () => {
  it('is stable, invented, and has the same shape as the sheet', () => {
    const a = demoLeadsFile();
    expect(a).toEqual(demoLeadsFile());
    expect(a.origin).toBe('demo');
    expect(a.leads.every((l) => !l.product || l.product.startsWith('Demo'))).toBe(true);
    expect(a.purchases.every((p) => p.lead === null || a.leads[p.lead])).toBe(true);
    const b = purchaseSummary(a.purchases);
    expect(b.bot.purchases).toBeGreaterThan(0);
    expect(b.undecided.purchases).toBeGreaterThan(0);
  });
});

describe('the data file', () => {
  it('drops empty fields and restores them', async () => {
    const { pack, unpack } = await import('../lib/leads/file');
    const f = demoLeadsFile(50);
    const text = pack(f);
    expect(text).not.toContain('null');
    expect(unpack(JSON.parse(text))).toEqual(f);
    expect(() => unpack({ version: 1, leads: [] })).toThrow();
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

describe('time buckets', () => {
  it('starts weeks on Sunday, in Israel time, and rolls months over the year', () => {
    // יום שני 19/10/2026 -> השבוע של יום ראשון 18/10
    expect(bucketOf('2026-10-19T09:00:00.000Z', 'week')).toBe('2026-10-18');
    // שבת 24/10 בלילה, 23:30 בישראל, עדיין באותו שבוע
    expect(bucketOf('2026-10-24T20:30:00.000Z', 'week')).toBe('2026-10-18');
    expect(bucketOf('2026-10-24T20:30:00.000Z', 'month')).toBe('2026-10');
    const s = timeSeries(['2025-12-10T10:00:00.000Z', '2026-02-01T10:00:00.000Z'], (x) => x, 'month', 1, () => [1]);
    expect(s).toEqual([{ key: '2025-12', values: [1] }, { key: '2026-01', values: [0] }, { key: '2026-02', values: [1] }]);
  });

  it('picks day up to two months, week up to half a year, then month', () => {
    const span = (days: number) => [lead({ at: '2026-01-01T10:00:00.000Z' }), lead({ at: new Date(Date.parse('2026-01-01T10:00:00.000Z') + (days - 1) * 86_400_000).toISOString() })];
    expect(autoBucket(span(62))).toBe('day');
    expect(autoBucket(span(63))).toBe('week');
    expect(autoBucket(span(182))).toBe('week');
    expect(autoBucket(span(183))).toBe('month');
    expect(autoBucket([])).toBe('day');
  });
});
