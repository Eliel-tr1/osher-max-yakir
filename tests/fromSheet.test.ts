import { describe, expect, it } from 'vitest';
import { leadsFromRows, REQUIRED_COLUMNS, SheetShapeError } from '../lib/leads/fromSheet';

const HEADER = ['קוד מזהה', 'שם לקוח', ...REQUIRED_COLUMNS, 'הערות'];

/** שורה בטבלה מדומה. פרטים אישיים מומצאים. */
function row(p: Partial<Record<string, string>>): string[] {
  return HEADER.map((h) => p[h] ?? '');
}

const base = { 'שם לקוח': 'לקוח בדיקה', טלפון: '0500000001', 'מקור הגעה': "אורגני - צ'אטבוט וואטסאפ", 'שם תהליך': 'תהליך ראשי' };

describe('leadsFromRows', () => {
  it('keeps only the dashboard fields: no name, phone, email or notes', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', מייל: 'x@example.com', הערות: 'פרטי', 'סטטוס שאלון': 'Converted', 'סכום ששולם': '99', מבחן: 'Test 20K', 'מוצר שנקנה': '-' }),
    ]);
    const json = JSON.stringify(file);
    expect(json).not.toContain('0500000001');
    expect(json).not.toContain('x@example.com');
    expect(json).not.toContain('לקוח בדיקה');
    expect(json).not.toContain('פרטי');
    expect(file.leads[0]).toMatchObject({ qStatus: 'converted', amount: 99, test: 'Test 20K', product: null, process: 'תהליך ראשי' });
  });

  it('drops the emptier row of a pair from the same phone within seconds, and keeps later purchases', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' }),
      row({ ...base, טלפון: '+972-50-000-0001', 'תאריך כניסה': '01/10/2026 10:00:04', 'סטטוס שאלון': 'converted', 'סכום ששולם': '149' }),
      row({ ...base, 'תאריך כניסה': '05/10/2026 18:30:00', 'סטטוס שאלון': 'converted', 'סכום ששולם': '49' }),
      row({ ...base, טלפון: '0500000002', 'תאריך כניסה': '01/10/2026 10:00:00' }),
    ]);
    expect(file.sheetRows).toBe(4);
    expect(file.duplicatesRemoved).toBe(1);
    expect(file.leads.map((l) => l.amount)).toEqual([null, 149, 49]);
  });

  it('treats an exact same-second pair the same way, and keeps the first when both are equally full', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', 'סטטוס': 'עבר' }),
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', 'סטטוס': 'לא עבר' }),
    ]);
    expect(file.duplicatesRemoved).toBe(1);
    expect(file.leads.map((l) => l.status)).toEqual(['עבר']);
  });

  it('does not merge rows more than the window apart', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' }),
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:11' }),
    ]);
    expect(file.duplicatesRemoved).toBe(0);
  });

  it('counts rows without a valid entry date, and reads the removal date', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '' , 'סטטוס': 'עבר' }),
      row({ ...base, טלפון: '0500000003', 'תאריך כניסה': '01/10/2026 10:00:00', 'הסיר את עצמו?': '06/10/2026 16:47' }),
    ]);
    expect(file.skippedRows).toBe(1);
    expect(file.leads[0].removedAt).toBe('2026-10-06T13:47:00.000Z');
  });

  it('reads the optional conversation mode column, and works without it', () => {
    const withMode = leadsFromRows([[...HEADER, 'אופן שיחה'], [...row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' }), 'מכירותי']]);
    expect(withMode.leads[0].mode).toBe('מכירותי');
    const without = leadsFromRows([HEADER, row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' })]);
    expect(without.leads[0].mode).toBeNull();
  });

  it('fails loudly when a needed column is renamed', () => {
    const header = HEADER.map((h) => (h === 'סכום ששולם' ? 'סכום' : h));
    expect(() => leadsFromRows([header])).toThrow(SheetShapeError);
    expect(() => leadsFromRows([header])).toThrow(/סכום ששולם/);
  });
});
