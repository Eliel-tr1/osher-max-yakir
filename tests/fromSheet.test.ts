import { describe, expect, it } from 'vitest';
import { leadsFromRows, PURCHASE_COLUMNS, REQUIRED_COLUMNS, SheetShapeError } from '../lib/leads/fromSheet';

const HEADER = ['שם לקוח', ...REQUIRED_COLUMNS, 'טלפון', 'מייל', 'הערות'];
const PHEADER = [...PURCHASE_COLUMNS, 'שם לקוח', 'טלפון', 'לינק לשיחה', 'קופון מהרכישה'];

/** שורה בטבלה מדומה. פרטים אישיים מומצאים. */
function row(p: Partial<Record<string, string>>): string[] {
  return HEADER.map((h) => p[h] ?? '');
}
function prow(p: Partial<Record<string, string>>): string[] {
  return PHEADER.map((h) => p[h] ?? '');
}

const base = { 'שם לקוח': 'לקוח בדיקה', טלפון: '0500000001', 'קוד מזהה': 'u1', 'מקור הגעה': "אורגני - צ'אטבוט וואטסאפ", 'שם תהליך': 'תהליך ראשי' };

describe('leadsFromRows', () => {
  it('keeps only the dashboard fields: no name, phone, email, id or notes', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', מייל: 'x@example.com', הערות: 'פרטי', 'סטטוס שאלון': 'Converted', 'סכום ששולם': '99', מבחן: 'Test 20K', 'מוצר שנקנה': '-' }),
    ], [PHEADER, prow({ תאריך: '02/10/2026 11:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'Lightning Pro', 'סכום ששולם': '99', 'מקור הגעה': 'ig', 'שם לקוח': 'לקוח בדיקה', טלפון: '0500000001' })]);
    const json = JSON.stringify(file);
    for (const secret of ['0500000001', 'x@example.com', 'לקוח בדיקה', 'פרטי', '"u1"']) expect(json).not.toContain(secret);
    expect(file.leads[0]).toMatchObject({ qStatus: 'converted', amount: 99, test: 'Test 20K', product: null, process: 'תהליך ראשי', sourceGroup: 'בוט וואטסאפ' });
    expect(file.purchases).toEqual([{ at: '2026-10-02T08:00:00.000Z', lead: 0, product: 'Lightning Pro', amount: 99, source: 'ig', sourceGroup: 'ig', campaign: null, fromLead: false, bot: null }]);
  });

  it('one person per id: keeps the fuller row, and the first when equally full', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' }),
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:04', 'סטטוס שאלון': 'converted', 'סכום ששולם': '149' }),
      row({ ...base, 'תאריך כניסה': '05/10/2026 18:30:00', 'סטטוס שאלון': 'converted', 'סכום ששולם': '49' }),
      row({ ...base, 'קוד מזהה': 'u2', 'תאריך כניסה': '01/10/2026 10:00:00', סטטוס: 'עבר' }),
      row({ ...base, 'קוד מזהה': 'u2', 'תאריך כניסה': '01/10/2026 10:00:00', סטטוס: 'לא עבר' }),
      row({ ...base, 'קוד מזהה': '', 'תאריך כניסה': '01/10/2026 10:00:00' }),
      row({ ...base, 'קוד מזהה': '', 'תאריך כניסה': '01/10/2026 10:00:00' }),
    ]);
    expect(file.sheetRows).toBe(7);
    // u1: שתי השורות המלאות שוות, נשארת הראשונה מביניהן. u2: הראשונה. בלי קוד: כל שורה לעצמה. הסדר לפי תאריך
    expect(file.leads.map((l) => [l.amount, l.status])).toEqual([[null, 'עבר'], [null, null], [null, null], [149, null]]);
  });

  it('hides rows from before the launch, and purchases that are tests', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '09/07/2025 19:24:00' }),
      row({ ...base, 'קוד מזהה': 'u2', 'תאריך כניסה': '31/08/2026 23:59:00' }),
      row({ ...base, 'קוד מזהה': 'u3', 'תאריך כניסה': '01/09/2026 00:00:00' }),
    ], [
      PHEADER,
      prow({ תאריך: '10/07/2023 11:00', 'קוד מזהה': 'u3', 'מוצר שנקנה': 'Lightning Pro', 'סכום ששולם': '2' }),
      prow({ תאריך: '28/10/2026 11:00', 'קוד מזהה': 'u3', 'מוצר שנקנה': 'בדיקת n8n', 'סכום ששולם': '1', 'מקור הגעה': 'vitrue' }),
      prow({ תאריך: '28/10/2026 11:00', 'קוד מזהה': 'u3', 'מוצר שנקנה': 'Test order', 'סכום ששולם': '1' }),
      prow({ תאריך: '28/10/2026 12:00', 'קוד מזהה': 'u3', 'מוצר שנקנה': 'One Step Assessment - 100K - MT5', 'סכום ששולם': '49', 'מקור הגעה': 'vitrue' }),
    ]);
    expect(file.leads).toHaveLength(1);
    expect(file.purchases.map((p) => p.product)).toEqual(['One Step Assessment - 100K - MT5']);
  });

  it('drops the same purchase written twice within two minutes, keeps a repeat purchase later', () => {
    const file = leadsFromRows([HEADER, row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' })], [
      PHEADER,
      prow({ תאריך: '02/10/2026 11:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'A', 'סכום ששולם': '29' }),
      prow({ תאריך: '02/10/2026 11:01', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'A', 'סכום ששולם': '29' }),
      prow({ תאריך: '02/10/2026 11:01', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'B', 'סכום ששולם': '5' }),
      prow({ תאריך: '02/10/2026 18:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'A', 'סכום ששולם': '29' }),
      prow({ תאריך: '02/10/2026 18:00', 'קוד מזהה': '', 'מוצר שנקנה': 'A', 'סכום ששולם': '29' }),
      prow({ תאריך: '02/10/2026 18:00', 'קוד מזהה': '', 'מוצר שנקנה': 'A', 'סכום ששולם': '29' }),
    ]);
    expect(file.purchases.map((p) => [p.product, p.amount, p.lead])).toEqual([['A', 29, 0], ['B', 5, 0], ['A', 29, null], ['A', 29, null], ['A', 29, 0]]);
  });

  it('fills a missing product name from the lead only when it is the same purchase, and takes old buyers from the leads tab', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', 'סטטוס שאלון': 'payment', 'סכום ששולם': '99', 'מוצר שנקנה': 'Lightning Pro' }),
      row({ ...base, 'קוד מזהה': 'u2', 'תאריך כניסה': '03/10/2026 10:00:00', 'סטטוס שאלון': 'converted', 'סכום ששולם': '49', מבחן: 'One Step 20K' }),
      row({ ...base, 'קוד מזהה': 'u3', 'תאריך כניסה': '04/10/2026 10:00:00', 'סטטוס שאלון': 'finished' }),
    ], [
      PHEADER,
      prow({ תאריך: '02/10/2026 11:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': '-', 'סכום ששולם': '99' }),
      prow({ תאריך: '02/10/2026 12:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': '-', 'סכום ששולם': '5' }),
      prow({ תאריך: '02/10/2026 13:00', 'קוד מזהה': 'u9', 'מוצר שנקנה': '-', 'סכום ששולם': '' }),
    ]);
    expect(file.purchases.map((p) => [p.product, p.amount, p.lead, p.fromLead])).toEqual([
      ['Lightning Pro', 99, 0, false],
      [null, 5, 0, false],
      [null, null, null, false],
      ['One Step 20K', 49, 1, true],
    ]);
  });

  it('groups sources: the bot, a product or test name means the website, anything else is a channel', () => {
    const file = leadsFromRows([
      HEADER,
      row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', 'מקור הגעה': 'צאטבוט' }),
      row({ ...base, 'קוד מזהה': 'u2', 'תאריך כניסה': '01/10/2026 10:00:00', 'מקור הגעה': 'Lightning Pro', 'מוצר שנקנה': 'Lightning Pro' }),
      row({ ...base, 'קוד מזהה': 'u3', 'תאריך כניסה': '01/10/2026 10:00:00', 'מקור הגעה': 'One Step 20K', מבחן: 'One Step 20K' }),
      row({ ...base, 'קוד מזהה': 'u4', 'תאריך כניסה': '01/10/2026 10:00:00', 'מקור הגעה': 'Instant', 'סכום ששולם': '10' }),
      row({ ...base, 'קוד מזהה': 'u5', 'תאריך כניסה': '01/10/2026 10:00:00', 'מקור הגעה': 'google' }),
      row({ ...base, 'קוד מזהה': 'u6', 'תאריך כניסה': '01/10/2026 10:00:00', 'מקור הגעה': '' }),
    ], [PHEADER, prow({ תאריך: '02/10/2026 11:00', 'קוד מזהה': 'u4', 'מוצר שנקנה': 'Instant', 'סכום ששולם': '10', 'מקור הגעה': 'Instant' })]);
    expect(file.leads.map((l) => l.sourceGroup)).toEqual(['בוט וואטסאפ', 'מהאתר (מבחן או רכישה)', 'מהאתר (מבחן או רכישה)', 'מהאתר (מבחן או רכישה)', 'google', null]);
    expect(file.purchases[0].sourceGroup).toBe('מהאתר (מבחן או רכישה)');
  });

  it('reads the removal date, the optional agent columns by name, and works without a purchases tab', () => {
    const header = [...HEADER, 'עמודה עתידית', 'התחיל שיחה', 'אופן שיחה'];
    const r = (started: string, mode = 'מכירתית') => [...row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00', 'הסיר את עצמו?': '06/10/2026 16:47', 'סטטוס שאלון': 'converted', 'סכום ששולם': '20' }), 'x', started, mode];
    const withCols = leadsFromRows([header, r('כן')]);
    expect(withCols.leads[0]).toMatchObject({ aiConversation: 'yes', mode: 'מכירתית', removedAt: '2026-10-06T13:47:00.000Z' });
    expect(withCols.purchaseRows).toBe(0);
    expect(withCols.purchases).toEqual([{ at: '2026-10-01T07:00:00.000Z', lead: 0, product: null, amount: 20, source: null, sourceGroup: null, campaign: null, fromLead: true, bot: null }]);
    expect(leadsFromRows([header, r('לא')]).leads[0].aiConversation).toBe('no');
    expect(leadsFromRows([header, r('')]).leads[0].aiConversation).toBeNull();
    const without = leadsFromRows([HEADER, row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' })]);
    expect(without.leads[0]).toMatchObject({ aiConversation: null, mode: null });
  });

  it('reads "של הבוט" on every purchase row: exactly "כן" is the bot, empty is undecided, anything else is no', () => {
    const file = leadsFromRows(
      [HEADER, row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' }), row({ ...base, 'קוד מזהה': 'u2', 'תאריך כניסה': '01/10/2026 10:00:00', 'סטטוס שאלון': 'converted', 'סכום ששולם': '9' })],
      [
        [...PHEADER, 'של הבוט'],
        ...['כן', '  כן ', 'לא', '', 'yes', 'כן.', 'כ ן', 'כןכן'].map((v, i) => [
          ...prow({ תאריך: `02/10/2026 1${i}:00`, 'קוד מזהה': 'u1', 'מוצר שנקנה': 'A', 'סכום ששולם': String(10 + i), 'מקור הגעה': 'vitrue' }), v,
        ]),
      ],
    );
    // הראשונה (לפי תאריך) נלקחה משורת הליד של u2, שאין לו שורות ברכישות: עוד לא הוכרעה
    expect(file.purchases[0]).toMatchObject({ fromLead: true, bot: null });
    expect(file.purchases.slice(1).map((p) => p.bot)).toEqual(['yes', 'yes', 'no', null, 'no', 'no', 'no', 'no']);
  });

  it('works without the "של הבוט" column: every purchase is undecided, and the refresh does not fail', () => {
    const file = leadsFromRows([HEADER, row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' })], [
      PHEADER,
      prow({ תאריך: '02/10/2026 11:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'A', 'סכום ששולם': '29', 'מקור הגעה': 'vitrue' }),
    ]);
    expect(file.purchases.map((p) => p.bot)).toEqual([null]);
  });

  it('reads utm_campaign on purchases when the column exists', () => {
    const file = leadsFromRows([HEADER, row({ ...base, 'תאריך כניסה': '01/10/2026 10:00:00' })], [
      [...PHEADER, 'utm_campaign'],
      [...prow({ תאריך: '02/10/2026 11:00', 'קוד מזהה': 'u1', 'מוצר שנקנה': 'A', 'סכום ששולם': '29', 'מקור הגעה': 'vitrue' }), 'halloween_lightning'],
    ]);
    expect(file.purchases[0]).toMatchObject({ source: 'vitrue', campaign: 'halloween_lightning' });
  });

  it('fails loudly when a needed column is renamed, in either tab', () => {
    const header = HEADER.map((h) => (h === 'סכום ששולם' ? 'סכום' : h));
    expect(() => leadsFromRows([header])).toThrow(SheetShapeError);
    expect(() => leadsFromRows([header])).toThrow(/הלידים.*סכום ששולם/);
    expect(() => leadsFromRows([HEADER], [PHEADER.map((h) => (h === 'תאריך' ? 'date' : h))])).toThrow(/הרכישות.*תאריך/);
  });
});
