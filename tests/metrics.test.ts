import { describe, expect, it } from 'vitest';
import { demoLeads } from '../lib/leads/demo';
import type { Lead } from '../lib/leads/types';
import { inRange, parseAmount, parseSheetDate, summarize } from '../lib/metrics';

function lead(p: Partial<Lead>): Lead {
  return {
    id: 'x', enteredAt: new Date('2026-10-01T10:00:00+03:00'), status: null, answeredChatbot: false,
    questionnaireStep: null, questionnaireStatus: null, process: null, score: null, product: null, amountPaid: null, ...p,
  };
}

describe('summarize', () => {
  it('counts leads, answers, finished questionnaires and payments', () => {
    const s = summarize([
      lead({ answeredChatbot: true, questionnaireStatus: 'finished' }),
      lead({ answeredChatbot: true, questionnaireStatus: 'converted', amountPaid: 990 }),
      lead({ answeredChatbot: true, questionnaireStatus: 'started' }),
      lead({}),
    ]);
    expect(s).toEqual({ leads: 4, answered: 3, answeredRate: 0.75, finishedQuestionnaire: 2, paid: 1, revenue: 990 });
  });

  it('has no rate when there are no leads', () => {
    expect(summarize([]).answeredRate).toBeNull();
  });
});

describe('inRange', () => {
  it('includes the start and excludes the end', () => {
    const from = new Date('2026-10-01T00:00:00+03:00');
    const to = new Date('2026-10-02T00:00:00+03:00');
    const rows = [lead({ id: 'a', enteredAt: from }), lead({ id: 'b', enteredAt: to })];
    expect(inRange(rows, { from, to }).map((r) => r.id)).toEqual(['a']);
  });
});

describe('parseSheetDate', () => {
  it('reads the sheet format in Israel time, summer and winter', () => {
    expect(parseSheetDate('30/09/2026 10:09')?.toISOString()).toBe('2026-09-30T07:09:00.000Z');
    expect(parseSheetDate('09/12/2025 22:24')?.toISOString()).toBe('2025-12-09T20:24:00.000Z');
    expect(parseSheetDate('9/7/2025')?.toISOString()).toBe('2025-07-08T21:00:00.000Z');
  });

  it('rejects what is not a real date', () => {
    expect(parseSheetDate('')).toBeNull();
    expect(parseSheetDate('31/02/2026')).toBeNull();
    expect(parseSheetDate('2026-10-01')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('cleans signs, currency and separators', () => {
    expect(parseAmount('- 990')).toBe(990);
    expect(parseAmount('₪2,400')).toBe(2400);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('לא שולם')).toBeNull();
  });
});

describe('demoLeads', () => {
  it('is stable and holds no real people', () => {
    const a = demoLeads();
    expect(a).toEqual(demoLeads());
    expect(a.every((l) => l.id.startsWith('DEMO-'))).toBe(true);
  });
});
