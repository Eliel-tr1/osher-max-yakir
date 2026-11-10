import { describe, expect, it } from 'vitest';
import {
  abandonView, BOT_FAILURE, feedbackView, inquiryView, inRangeOrAll, lastScan, OTHER, questionView, removalView, sampleSize, startsBeforeData, stopOf,
  testLeadsOf, type Scope,
} from '../lib/insights';
import type { AnalysisRow, FeedbackRow, InquiryRow, QuestionRow } from '../lib/leads/types';

/** תובנות שיחה (הנחיית המנהל 3/11/2026, #26): ההגדרות של סעיפים 4 עד 8 */
const all = { from: null, to: null };
const scope = (over: Partial<Scope> = {}): Scope => ({ range: all, keep: null, testLeads: new Set(), ...over });

function row(p: Partial<AnalysisRow>): AnalysisRow {
  return {
    at: '2026-10-20T07:00:00.000Z', lead: null, path: 'תהליך ראשי', bought: 'no', step: 'לא התחיל שאלון', reason: 'הפסיק לענות בשאלון', agent: false, inquiry: null,
    unanswered: 0, feedback: null, messages: null, scannedAt: null, removal: null, basis: "צ'אט", ...p,
  };
}

describe('why people left (section 4)', () => {
  const rows: AnalysisRow[] = [
    row({ reason: 'הפסיק לענות בשאלון', step: 'התחיל שאלון (שלב 3)' }),
    row({ reason: 'הפסיק לענות בשאלון', step: 'התחיל שאלון (שלב 3)', path: 'פופאפ' }),
    row({ reason: 'הפסיק לענות בשאלון', step: 'התחיל שאלון' }),
    row({ reason: BOT_FAILURE, step: 'סיים שאלון' }),
    row({ reason: 'נרתע מהמחיר והתוספים', step: 'אחרי מבחן', path: 'מבחן - לא עבר' }),
    // ניהלו שיחה וקנו
    row({ reason: 'אין נטישה - רכש', bought: 'yes', step: 'רכש' }),
    row({ reason: 'אין נטישה - רכש', bought: 'yes', step: 'רכש בבוט' }),
    // חריג: רכישה לפני 2/10, לא בשום קבוצה
    row({ reason: 'אין נטישה - רכש', bought: 'no', step: 'רכש בבוט' }),
    // בלי שיחה
    row({ reason: 'לא כתב לבוט' }), row({ reason: 'הודעה בודדת בלבד' }), row({ reason: 'רכש בלי שיחה', bought: 'yes', step: 'רכש' }),
    // עוד בבדיקה
    row({ reason: 'לא ברור מהסיכום' }), row({ reason: null }),
    // שיחת בדיקה: לא נספרת בשום מקום
    row({ reason: 'שיחת בדיקה', lead: 7 }),
  ];

  it('counts the abandoned only by the definition, and the reasons add up to them', () => {
    const v = abandonView(rows, scope(), null);
    expect(v.abandoned).toBe(5);
    expect(v.reasons.reduce((s, r) => s + r.count, 0)).toBe(v.abandoned);
    expect(v.reasons[0]).toMatchObject({ name: 'הפסיק לענות בשאלון', count: 3 });
    expect(v.bought).toBe(2);
    expect(v.noConversation).toEqual([{ name: 'לא כתב לבוט', count: 1 }, { name: 'הודעה בודדת בלבד', count: 1 }, { name: 'רכש בלי שיחה', count: 1 }]);
    expect(v.pending).toBe(2);
    expect(v.rows.some((x) => x.r.reason === 'שיחת בדיקה')).toBe(false);
  });

  it('shows where everyone who did not buy stopped, with "started" merged and split by step', () => {
    const v = abandonView(rows, scope(), null);
    expect(v.stops.map((s) => [s.name, s.count])).toEqual([
      ['לא התחיל שאלון', 4], ['התחיל שאלון', 3], ['סיים שאלון', 1], ['אחרי מבחן', 1], ['רכש בבוט', 1],
    ]);
    expect(v.stepN).toEqual([{ name: 'שלב 3', count: 2 }, { name: 'בלי מספר שלב', count: 1 }]);
    expect(stopOf('התחיל שאלון (שלב 10)')).toBe('התחיל שאלון');
    expect(stopOf(null)).toBe('לא ידוע');
  });

  it('filters by path, date range and source', () => {
    expect(abandonView(rows, scope(), 'פופאפ').abandoned).toBe(1);
    expect(abandonView(rows, scope(), 'מבחן - לא עבר').reasons.map((r) => r.name)).toEqual(['נרתע מהמחיר והתוספים']);
    const later = { from: new Date('2026-10-21T00:00:00.000Z'), to: null };
    expect(abandonView(rows, scope({ range: later }), null).rows).toHaveLength(0);
    const leads = rows.map((r, i) => ({ ...r, lead: i }));
    expect(abandonView(leads, scope({ keep: new Set([0, 1]) }), null).abandoned).toBe(2);
  });

  it('keeps rows with no date only in the full range', () => {
    expect(inRangeOrAll(null, all)).toBe(true);
    expect(inRangeOrAll(null, { from: new Date('2026-10-01T00:00:00Z'), to: null })).toBe(false);
    expect(startsBeforeData(all)).toBe(true);
    expect(startsBeforeData({ from: new Date('2026-10-01T21:00:00.000Z'), to: null })).toBe(false);
    expect(startsBeforeData({ from: new Date('2026-09-25T00:00:00.000Z'), to: null })).toBe(true);
  });
});

describe('service inquiries (section 5)', () => {
  const inq = (category: string | null, who: number, at = '2026-10-20T07:00:00.000Z', lead: number | null = null): InquiryRow => ({ at, lead, who, category, sub: null, topic: null, question: null, dup: false });
  const rows: InquiryRow[] = [
    ...Array.from({ length: 6 }, (_, k) => inq('הפעלת חשבון ושדרוג', k % 4)),
    ...Array.from({ length: 5 }, (_, k) => inq('מכירות והנחות', 10 + k, '2026-10-28T07:00:00.000Z')),
    ...Array.from({ length: 4 }, (_, k) => inq('תשלומים וחיובים', 20 + k)),
    inq('אחר', 30), inq(null, 31), inq(null, 32),
    inq('הפעלת חשבון ושדרוג', 40, '2026-10-20T07:00:00.000Z', 7),
  ];

  it('counts inquiries and people, moves small categories into "other", and leaves out test conversations', () => {
    const v = inquiryView(rows, scope({ testLeads: testLeadsOf([row({ reason: 'שיחת בדיקה', lead: 7 })]) }));
    expect(v.categorized).toBe(16);
    expect(v.pending).toBe(2);
    expect(v.cats.map((c) => [c.name, c.count, c.people])).toEqual([['הפעלת חשבון ושדרוג', 6, 4], ['מכירות והנחות', 5, 5], [OTHER, 5, 5]]);
    expect(v.cats[0].share).toBeCloseTo(6 / 16);
    expect(v.top3).toEqual(['הפעלת חשבון ושדרוג', 'מכירות והנחות']);
    // לפי שבוע: שבוע של 18/10 ושבוע של 25/10
    expect(v.weekly.map((w) => [w.key, w.values])).toEqual([['2026-10-18', [6, 0, 5]], ['2026-10-25', [0, 5, 0]]]);
  });

  it('decides "other" by the selected range', () => {
    const late = { from: new Date('2026-10-25T00:00:00.000Z'), to: null };
    expect(inquiryView(rows, scope({ range: late })).cats.map((c) => c.name)).toEqual(['מכירות והנחות']);
  });
});

describe('feedback after the exam (section 6)', () => {
  const fb = (category: string | null, exam: FeedbackRow['exam']): FeedbackRow => ({ at: '2026-10-20T07:00:00.000Z', lead: null, who: 0, category, exam });
  it('splits by passed and failed', () => {
    const rows = [fb('בקשת תנאים גמישים', 'failed'), fb('בקשת תנאים גמישים', 'failed'), fb('שבע רצון ללא הערות', 'passed'), fb(null, 'failed'), fb('אחר', null)];
    expect(feedbackView(rows, scope(), 'all')).toMatchObject({ categorized: 4, pending: 1 });
    expect(feedbackView(rows, scope(), 'failed').cats.map((c) => [c.name, c.count])).toEqual([['בקשת תנאים גמישים', 2]]);
    expect(feedbackView(rows, scope(), 'passed').cats.map((c) => c.name)).toEqual(['שבע רצון ללא הערות']);
  });
});

describe('questions for Yakir (section 7)', () => {
  const qs = (count: number, status: string | null, lastAt: string | null = '2026-10-20T07:00:00.000Z'): QuestionRow => ({ text: `q${count}`, category: null, count, lastAt, status, answer: null });
  it('shows only questions asked twice or more by default, sorted, with the answered count', () => {
    const rows = [qs(1, 'ממתין לתשובה'), qs(4, 'נענה'), qs(2, 'ממתין לתשובה'), qs(3, 'עודכן במאגר')];
    const v = questionView(rows, all, false);
    expect(v.shown.map((x) => x.r.count)).toEqual([4, 3, 2]);
    expect(v.all).toHaveLength(4);
    expect([v.answered, v.waiting]).toEqual([2, 2]);
    expect(questionView(rows, all, true).shown).toHaveLength(4);
    expect(questionView(rows, { from: new Date('2026-10-25T00:00:00.000Z'), to: null }, true).shown).toHaveLength(0);
  });
});

describe('removals, sample and last scan (sections 7 and 8)', () => {
  it('counts removals by reason, the chat sample and the last scan', () => {
    const rows = [
      row({ removal: 'לא מעוניין', scannedAt: '2026-11-03T03:00:00.000Z' }), row({ removal: 'לא מעוניין' }), row({ removal: 'אחר', reason: 'שיחת בדיקה' }),
      row({ basis: 'סיכום', scannedAt: '2026-11-03T05:00:00.000Z' }),
    ];
    expect(removalView(rows, scope())).toEqual({ count: 2, reasons: [{ name: 'לא מעוניין', count: 2 }] });
    expect(sampleSize(rows)).toBe(0);
    expect(sampleSize(Array.from({ length: 456 }, () => row({})))).toBe(460);
    expect(lastScan(rows)).toBe('2026-11-03T05:00:00.000Z');
    expect(lastScan(null)).toBeNull();
  });
});
