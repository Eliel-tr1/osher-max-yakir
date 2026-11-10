import { describe, expect, it } from 'vitest';
import { ALL, leadFilter } from '../lib/filters';
import { NO_DETAIL, STALL_QUESTION, STALL_TEMPLATE, STALL_UNKNOWN, stallView, TOP_QUESTIONS, type Scope } from '../lib/insights';
import { unpackInsights } from '../lib/leads/file';
import { insightsFromRows } from '../lib/leads/fromSheet';
import type { StallRow } from '../lib/leads/types';

/** "איפה נתקעים" (#38): קריאת הלשונית "נקודות עצירה" והספירה */
const HEADER = ['קוד מזהה', 'תאריך כניסה', 'שם תהליך', 'נקודת עצירה', 'פירוט', 'הודעות לקוח', 'פעילות אחרונה', 'נסרק ב:'];
const at = '2026-11-10T03:00:00.000Z';
const read = (rows: string[][] | null | undefined, leadOfNs = new Map<string, number>(), names = new Map<string, string>()) =>
  insightsFromRows({ stalls: rows }, at, leadOfNs, names);

describe('reading the "נקודות עצירה" tab', () => {
  it('reads by header name, in any column order', () => {
    const order = [...HEADER].reverse();
    const row: Record<string, string> = {
      'קוד מזהה': 'A1', 'תאריך כניסה': '08/11/2026 14:05', 'שם תהליך': ' תהליך ראשי ', 'נקודת עצירה': 'לא ענה לטמפלייט', פירוט: 'client_notification_new_lead_v1',
      'הודעות לקוח': '0', 'פעילות אחרונה': '08/11/2026 14:06', 'נסרק ב:': '10/11/2026 02:15',
    };
    const x = read([order, order.map((h) => row[h]), order.map(() => '')], new Map([['A1', 4]]), new Map([['A1', 'לקוח א']]));
    expect(x.file.stalls).toEqual({
      readAt: at,
      rows: [{
        at: '2026-11-08T12:05:00.000Z', lead: 4, process: 'תהליך ראשי', stop: 'לא ענה לטמפלייט', detail: 'client_notification_new_lead_v1', messages: 0,
        lastAt: '2026-11-08T12:06:00.000Z', scannedAt: '2026-11-10T00:15:00.000Z',
      }],
    });
    expect(x.ids.stalls).toEqual({ ns: ['A1'], names: ['לקוח א'], texts: [''] });
  });

  it('only the header (as today): an empty part, so the card hides', () => {
    expect(read([HEADER]).file.stalls).toEqual({ readAt: at, rows: [] });
  });

  it('a missing tab or a missing needed column: null, without failing the rest', () => {
    expect(read(null).file.stalls).toBeNull();
    expect(read(undefined).file.stalls).toBeNull();
    expect(read([HEADER.filter((h) => h !== 'נקודת עצירה'), ['A1', '08/11/2026 14:05']]).file.stalls).toBeNull();
    // בלי העמודות שלא חובה: נקרא, והן ריקות
    const min = read([['קוד מזהה', 'תאריך כניסה', 'נקודת עצירה'], ['A1', '08/11/2026 14:05', 'לא כתב לבוט']]).file.stalls!;
    expect(min.rows[0]).toMatchObject({ stop: 'לא כתב לבוט', process: null, detail: null, messages: null, lastAt: null, scannedAt: null, lead: null });
  });

  it('an old data file without stalls unpacks to null', () => {
    expect(unpackInsights({}).stalls).toBeNull();
    expect(unpackInsights({ stalls: { readAt: at, rows: [{ stop: 'לא כתב לבוט' }] } }).stalls!.rows[0]).toMatchObject({ stop: 'לא כתב לבוט', at: null, detail: null });
  });
});

describe('counting where leads get stuck', () => {
  const s = (p: Partial<StallRow>): StallRow => ({
    at: '2026-11-08T10:00:00.000Z', lead: null, process: null, stop: null, detail: null, messages: null, lastAt: null, scannedAt: null, ...p,
  });
  const rows: StallRow[] = [
    s({ lead: 0, stop: STALL_TEMPLATE, detail: 'tpl_a', scannedAt: '2026-11-09T00:15:00.000Z' }),
    s({ lead: 1, stop: STALL_TEMPLATE, detail: 'tpl_a', scannedAt: '2026-11-10T00:15:00.000Z' }),
    s({ lead: 2, stop: STALL_TEMPLATE, detail: 'tpl_b' }),
    s({ lead: 3, stop: STALL_TEMPLATE }),
    s({ lead: 0, stop: STALL_QUESTION, detail: 'מה גודל החשבון?' }),
    s({ lead: 1, stop: STALL_QUESTION, detail: 'מה גודל החשבון?' }),
    s({ lead: 2, stop: STALL_QUESTION, detail: 'כמה ניסיון?' }),
    s({ lead: null, stop: 'לא כתב לבוט' }),
    s({ lead: 3, stop: null }),
    // מחוץ לטווח
    s({ lead: 0, stop: 'לא כתב לבוט', at: '2026-10-01T10:00:00.000Z', scannedAt: '2026-11-08T00:15:00.000Z' }),
  ];
  const nov = { from: new Date('2026-11-01T00:00:00.000Z'), to: null };
  const scope = (p: Partial<Scope> = {}): Scope => ({ range: nov, keep: null, testLeads: new Set(), ...p });

  it('counts per stop point, largest first, with the share of all stalled leads', () => {
    const v = stallView(rows, scope());
    expect(v.total).toBe(9);
    expect(v.stops.map((c) => [c.name, c.count])).toEqual([[STALL_TEMPLATE, 4], [STALL_QUESTION, 3], [STALL_UNKNOWN, 1], ['לא כתב לבוט', 1]]);
    expect(v.stops[0].share).toBeCloseTo(4 / 9);
    expect(v.stops.reduce((n, c) => n + c.count, 0)).toBe(v.total);
  });

  it('breaks down templates and questions', () => {
    const v = stallView(rows, scope());
    expect(v.templates.map((c) => [c.name, c.count, c.share])).toEqual([['tpl_a', 2, 0.5], ['tpl_b', 1, 0.25], [NO_DETAIL, 1, 0.25]]);
    expect(v.questions.map((c) => [c.name, c.count])).toEqual([['מה גודל החשבון?', 2], ['כמה ניסיון?', 1]]);
    expect(v.questionCount).toBe(2);
  });

  it('keeps only the top 15 questions', () => {
    const many = Array.from({ length: 20 }, (_, k) => s({ stop: STALL_QUESTION, detail: `שאלה ${String(k).padStart(2, '0')}` }));
    const v = stallView(many, scope());
    expect(v.questions).toHaveLength(TOP_QUESTIONS);
    expect(v.questionCount).toBe(20);
  });

  it('the range is by entry date; "since" is the earliest scan in the whole tab', () => {
    expect(stallView(rows, scope({ range: { from: null, to: null } })).total).toBe(10);
    expect(stallView(rows, scope()).since).toBe('2026-11-08T00:15:00.000Z');
  });

  it('follows the source / process filter through the lead, and drops test conversations', () => {
    const leads = [{ i: 0, sourceGroup: 'גוגל', process: null }, { i: 1, sourceGroup: 'בוט', process: null }, { i: 2, sourceGroup: 'גוגל', process: null }, { i: 3, sourceGroup: 'בוט', process: null }];
    expect(stallView(rows, scope({ keep: leadFilter(leads, ALL, ALL).keep })).total).toBe(9);
    const g = stallView(rows, scope({ keep: leadFilter(leads, 'גוגל', ALL).keep }));
    expect(g.total).toBe(4);
    expect(g.stops.map((c) => [c.name, c.count])).toEqual([[STALL_TEMPLATE, 2], [STALL_QUESTION, 2]]);
    expect(stallView(rows, scope({ testLeads: new Set([0]) })).total).toBe(7);
  });
});
