import { describe, expect, it } from 'vitest';
import { ALL, leadFilter } from '../lib/filters';
import { inquiryDrill, inquiryView, NO_SUB, NO_TOPIC, OTHER, TOP_INQUIRY_QUESTIONS, type Scope } from '../lib/insights';
import { unpackInsights } from '../lib/leads/file';
import { insightsFromRows } from '../lib/leads/fromSheet';
import type { InquiryRow } from '../lib/leads/types';

/** "פניות שירות" (#38): תת קטגוריה, נושא, שאלה, ו"נספר" (כפילות לא נספרת) */
const at = '2026-11-10T03:00:00.000Z';
const read = (rows: string[][]) => insightsFromRows({ inquiries: rows }, at, new Map([['A', 2]]), new Map()).file.inquiries!;

describe('reading the new inquiry columns', () => {
  const head = ['תאריך פניה', 'מזהה לקוח', 'שם לקוח', 'קטגוריה', 'תת קטגוריה', 'נושא', 'שאלה', 'נספר'];
  it('reads them by header name', () => {
    const p = read([
      head,
      ['05/11/2026 10:00', 'A', 'x', 'הפעלת חשבון ושדרוג', 'הפעלה אחרי מעבר', 'לא קיבל פרטי חשבון', ' מתי אקבל את החשבון? ', 'כן'],
      ['05/11/2026 11:00', 'A', 'x', 'הפעלת חשבון ושדרוג', 'הפעלה אחרי מעבר', 'לא קיבל פרטי חשבון', 'מתי אקבל את החשבון?', 'כפילות'],
      ['05/11/2026 12:00', 'B', 'x', 'אחר', '', '', '', ''],
    ]);
    expect(p.rows[0]).toEqual({
      at: '2026-11-05T08:00:00.000Z', lead: 2, who: 0, category: 'הפעלת חשבון ושדרוג', sub: 'הפעלה אחרי מעבר', topic: 'לא קיבל פרטי חשבון',
      question: 'מתי אקבל את החשבון?', dup: false,
    });
    expect(p.rows[1].dup).toBe(true);
    // ריק נספר
    expect(p.rows[2]).toMatchObject({ sub: null, topic: null, question: null, dup: false });
  });

  it('old tabs without the columns still work, and count every row', () => {
    const p = read([['תאריך פניה', 'מזהה לקוח', 'קטגוריה'], ['05/11/2026 10:00', 'A', 'אחר']]);
    expect(p.rows[0]).toMatchObject({ category: 'אחר', sub: null, topic: null, question: null, dup: false });
    expect(unpackInsights({ inquiries: { readAt: at, rows: [{ at, category: 'אחר', who: 0 }] } }).inquiries!.rows[0]).toMatchObject({ sub: null, dup: false });
  });
});

const inq = (p: Partial<InquiryRow>): InquiryRow => ({
  at: '2026-11-05T08:00:00.000Z', lead: null, who: 0, category: 'הפעלת חשבון ושדרוג', sub: null, topic: null, question: null, dup: false, ...p,
});
const scope = (p: Partial<Scope> = {}): Scope => ({ range: { from: null, to: null }, keep: null, testLeads: new Set(), ...p });

describe('counting inquiries without duplicates', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, k) => inq({ who: k, lead: k % 2 })),
    inq({ who: 0, lead: 0, dup: true }),
    inq({ who: 1, lead: 1, dup: true, category: 'מכירות והנחות' }),
    inq({ who: 7, category: null }),
  ];

  it('drops "כפילות" rows from every number and reports how many', () => {
    const v = inquiryView(rows, scope());
    expect(v.categorized).toBe(6);
    expect(v.dupes).toBe(2);
    expect(v.pending).toBe(1);
    expect(v.cats.map((c) => [c.name, c.count])).toEqual([['הפעלת חשבון ושדרוג', 6]]);
    expect(v.cats[0].share).toBe(1);
  });

  it('follows the range and the source / process filter', () => {
    const leads = [{ i: 0, sourceGroup: 'גוגל', process: null }, { i: 1, sourceGroup: 'בוט', process: null }];
    const v = inquiryView(rows, scope({ keep: leadFilter(leads, 'גוגל', ALL).keep }));
    expect([v.categorized, v.dupes]).toEqual([3, 1]);
    expect(inquiryView(rows, scope({ range: { from: new Date('2026-11-06T00:00:00.000Z'), to: null } })).categorized).toBe(0);
  });

  it('small categories still go to "אחר"', () => {
    const v = inquiryView([...rows, inq({ category: 'תשלומים וחיובים' })], scope());
    expect(v.cats.map((c) => c.name)).toEqual(['הפעלת חשבון ושדרוג', OTHER]);
  });
});

describe('drill-down: sub-category, topic, questions', () => {
  const R = (p: Partial<InquiryRow>, i: number) => ({ r: inq(p), i });
  const rows = [
    R({ sub: 'הפעלה אחרי מעבר', topic: 'לא קיבל פרטים', question: 'מתי אקבל?' }, 0),
    R({ sub: 'הפעלה אחרי מעבר', topic: 'לא קיבל פרטים', question: 'מתי אקבל?' }, 1),
    R({ sub: 'הפעלה אחרי מעבר', topic: 'לא קיבל פרטים', question: 'איפה הסיסמה?' }, 2),
    R({ sub: 'הפעלה אחרי מעבר', topic: 'תשלום דמי הפעלה' }, 3),
    R({ sub: 'שדרוג', topic: 'שדרוג חשבון', question: 'אפשר לשדרג?' }, 4),
    R({}, 5),
  ];

  it('groups three levels with counts and shares, largest first', () => {
    const d = inquiryDrill(rows);
    expect(d.map((s) => [s.name, s.count])).toEqual([['הפעלה אחרי מעבר', 4], [NO_SUB, 1], ['שדרוג', 1]]);
    expect(d[0].share).toBeCloseTo(4 / 6);
    expect(d[0].topics.map((t) => [t.name, t.count, t.share])).toEqual([['לא קיבל פרטים', 3, 0.75], ['תשלום דמי הפעלה', 1, 0.25]]);
    expect(d[0].topics[0].questions).toEqual([{ name: 'מתי אקבל?', count: 2 }, { name: 'איפה הסיסמה?', count: 1 }]);
    expect(d[0].topics[1].questions).toEqual([]);
    expect(d[1].topics[0].name).toBe(NO_TOPIC);
    expect(d[0].topics[0].rows.map((x) => x.i)).toEqual([0, 1, 2]);
  });

  it('keeps up to 10 questions per topic', () => {
    const many = Array.from({ length: 14 }, (_, k) => R({ sub: 'א', topic: 'ב', question: `שאלה ${String(k).padStart(2, '0')}` }, k));
    const t = inquiryDrill(many)[0].topics[0];
    expect(t.questions).toHaveLength(TOP_INQUIRY_QUESTIONS);
    expect(t.questionCount).toBe(14);
  });
});
