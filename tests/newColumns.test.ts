import { describe, expect, it } from 'vitest';
import { pack } from '../lib/leads/file';
import {
  BOT_COUPON_GROUP, couponCode, leadsFromRows, MAILING_COLUMNS, MAILING_WAVE_COLUMNS, mailingsFromRows, PURCHASE_COLUMNS, REQUIRED_COLUMNS, wavesFromRows,
} from '../lib/leads/fromSheet';

/** העמודות החדשות של 31/10/2026: נקראות לפי שם הכותרת, לא לפי מיקום */
const LEAD_NEW = ['utm_campaign', 'הודעות לקוח', 'קופון הבוט', 'תאריך קופון'];
const PURCHASE_NEW = ['קופון מהרכישה', 'של הבוט', 'סיבה', 'utm_campaign'];

function table(header: string[], rows: Record<string, string>[]): string[][] {
  return [header, ...rows.map((r) => header.map((h) => r[h] ?? ''))];
}

const lead = {
  'תאריך כניסה': '20/10/2026 10:00', 'קוד מזהה': 'NS1', 'שם לקוח': 'לקוח בדיוני', טלפון: '0500000009', מייל: 'z@example.com', 'לינק לשיחה': 'https://chat.example/NS1',
  utm_campaign: 'popup_website', 'הודעות לקוח': '1', 'קופון הבוט': 'PTB-ABCDEF0123', 'תאריך קופון': '21/10/2026',
};
const buy = {
  תאריך: '22/10/2026 09:00', 'קוד מזהה': 'NS1', 'שם לקוח': 'לקוח בדיוני', טלפון: '0500000009', 'לינק לשיחה': 'https://chat.example/NS1', 'מוצר שנקנה': 'Lightning Pro',
  'סכום ששולם': '49', 'קופון מהרכישה': '{"code":"ptb-abcdef0123","discount":"60"}', 'של הבוט': 'כן', סיבה: 'קופון הבוט', utm_campaign: 'halloween_lightning',
};

describe('the new columns', () => {
  it('are read by header name, in any order', () => {
    for (const order of [1, -1]) {
      const lh = ['שם לקוח', ...REQUIRED_COLUMNS, 'טלפון', 'מייל', 'לינק לשיחה', ...LEAD_NEW].sort((a, b) => order * a.localeCompare(b));
      const ph = [...PURCHASE_COLUMNS, 'שם לקוח', 'טלפון', 'לינק לשיחה', ...PURCHASE_NEW].sort((a, b) => order * a.localeCompare(b));
      const f = leadsFromRows(table(lh, [lead, { ...lead, 'תאריך כניסה': '18/10/2026 08:00', 'הודעות לקוח': '' }]), table(ph, [buy]));
      expect(f.leads).toHaveLength(1);
      expect(f.leads[0]).toMatchObject({ campaign: 'popup_website', messages: 1, botCoupon: true, couponAt: '2026-10-20T21:00:00.000Z', firstAt: '2026-10-18T05:00:00.000Z' });
      expect(f.purchases[0]).toMatchObject({ reason: 'קופון הבוט', bot: 'yes', campaign: 'halloween_lightning', coupon: BOT_COUPON_GROUP, buyer: 0 });
    }
  });

  it('are optional: without them nothing breaks', () => {
    const f = leadsFromRows(table([...REQUIRED_COLUMNS], [lead]), table([...PURCHASE_COLUMNS], [buy]));
    expect(f.leads[0]).toMatchObject({ campaign: null, messages: null, botCoupon: false, couponAt: null, firstAt: null });
    expect(f.purchases[0]).toMatchObject({ reason: null, bot: null, campaign: null, coupon: null });
  });

  it('count buyers by id, also when the buyer is not in the leads tab', () => {
    const ph = [...PURCHASE_COLUMNS];
    const f = leadsFromRows(table([...REQUIRED_COLUMNS], [lead]), table(ph, [
      buy, { ...buy, תאריך: '23/10/2026 09:00' }, { ...buy, 'קוד מזהה': 'OTHER' }, { ...buy, 'קוד מזהה': 'OTHER', תאריך: '25/10/2026 09:00' }, { ...buy, 'קוד מזהה': '' }, { ...buy, 'קוד מזהה': '' },
    ]));
    expect(new Set(f.purchases.map((p) => p.buyer)).size).toBe(4);
    expect(f.purchases.filter((p) => p.lead === null)).toHaveLength(4);
  });
});

describe('couponCode', () => {
  it('reads JSON and text the same way, in capitals', () => {
    expect(couponCode('pass50')).toBe('PASS50');
    expect(couponCode(' PASS50 ')).toBe('PASS50');
    expect(couponCode('{"code":"pass50","discount":"50"}')).toBe('PASS50');
    expect(couponCode('{"code":"SPOOKY"}')).toBe('SPOOKY');
  });
  it('treats empty, "-", empty and an empty JSON code as no coupon', () => {
    for (const v of ['', ' ', '-', 'empty', 'EMPTY', '{"code":"","discount":""}', '{"discount":"5"}', '{"code":null}']) expect(couponCode(v)).toBeNull();
  });
  it('groups the bot personal coupons, without keeping the code', () => {
    for (const v of ['PTB-1A2B3C4D5E', 'ptb-1a2b3c4d5e', '{"code":"PTB-00FF00FF00"}']) expect(couponCode(v)).toBe(BOT_COUPON_GROUP);
    // לא בפורמט האישי: נשארים כמו שהם
    expect(couponCode('PTB-FLASH25')).toBe('PTB-FLASH25');
    expect(couponCode('PTB-1A2B3C4D5')).toBe('PTB-1A2B3C4D5');
    expect(couponCode('PTB-1A2B3C4D5G')).toBe('PTB-1A2B3C4D5G');
  });
  it('keeps broken JSON as text', () => {
    expect(couponCode('{bad')).toBe('{BAD');
  });
});

describe('the mailing tabs', () => {
  const mh = [...MAILING_COLUMNS, 'לינק לשיחה'];
  const m = {
    קמפיין: 'halloween_lightning', גל: 'גל 1 · 28/10', 'תאריך שליחה': '28/10/2026 11:00', 'תאריך רכישה': '28/10/2026 12:00', 'קוד מזהה': 'NS1', מוצר: 'Lightning Pro',
    סכום: '19.37', 'דרך קישור הקמפיין': 'כן', קופון: 'spooky', 'של הבוט': 'כן', סיבה: 'קישור הבוט (vitrue)', 'לינק לשיחה': 'https://chat.example/NS1',
  };
  it('reads the purchases, without id or link', () => {
    const rows = mailingsFromRows(table(mh, [m, { ...m, 'תאריך רכישה': '29/10/2026 08:00', 'דרך קישור הקמפיין': 'לא' }, { ...m, 'קוד מזהה': 'NS2', גל: 'לא נמען / לפני השליחה שלו', 'תאריך שליחה': '' }]))!;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      campaign: 'halloween_lightning', wave: 'גל 1 · 28/10', sentAt: '2026-10-28T09:00:00.000Z', at: '2026-10-28T10:00:00.000Z', buyer: 0, product: 'Lightning Pro',
      amount: 19.37, viaLink: true, coupon: 'SPOOKY', bot: 'yes', reason: 'קישור הבוט (vitrue)',
    });
    expect(rows.map((r) => r.buyer)).toEqual([0, 0, 1]);
    expect(rows[1].viaLink).toBe(false);
    expect(rows[2].sentAt).toBeNull();
    expect(JSON.stringify(rows)).not.toMatch(/NS1|chat\.example/);
  });
  it('reads the summary, and knows the waves, the non recipients and the total', () => {
    const rows = wavesFromRows(table([...MAILING_WAVE_COLUMNS], [
      { קמפיין: 'h', גל: 'גל 1 · 28/10', 'תאריך שליחה': '28/10/2026', נשלחו: '200', 'לא נמסרו (WhatsApp)': '14', נמסרו: '186', קונים: '18', רכישות: '23', סכום: '2367.22' },
      { קמפיין: 'h', גל: 'לא נמען / לפני השליחה שלו', קונים: '2', רכישות: '2', סכום: '85.5' },
      { קמפיין: 'h', גל: 'סה"כ נמענים', 'תאריך שליחה': '28-31/10/2026', נשלחו: '900', נמסרו: '779' },
    ]))!;
    expect(rows.map((r) => r.kind)).toEqual(['wave', 'others', 'total']);
    expect(rows[0]).toMatchObject({ sent: 200, undelivered: 14, delivered: 186, buyers: 18, purchases: 23, amount: 2367.22 });
  });
  it('is hidden when a tab is missing or a column is missing, and the rest keeps working', () => {
    expect(mailingsFromRows(table(mh.filter((h) => h !== 'סיבה'), [m]))).toBeNull();
    expect(wavesFromRows(table(['קמפיין', 'גל'], []))).toBeNull();
    const f = leadsFromRows(table([...REQUIRED_COLUMNS], [lead]), null, new Date(), table(['x'], [{ x: '1' }]), null);
    expect(f.leads).toHaveLength(1);
    expect(f.mailings).toBeNull();
    expect(JSON.parse(pack(f))).not.toHaveProperty('mailings');
  });
});

describe('the public data file', () => {
  it('has no id, link, name, phone, email or personal coupon code', () => {
    const lh = ['שם לקוח', ...REQUIRED_COLUMNS, 'טלפון', 'מייל', 'לינק לשיחה', ...LEAD_NEW];
    const ph = [...PURCHASE_COLUMNS, 'שם לקוח', 'טלפון', 'לינק לשיחה', ...PURCHASE_NEW];
    const mh = [...MAILING_COLUMNS, 'לינק לשיחה'];
    const json = pack(leadsFromRows(table(lh, [lead]), table(ph, [buy]), new Date(), table(mh, [{
      קמפיין: 'c', גל: 'g', 'תאריך רכישה': '28/10/2026 12:00', 'קוד מזהה': 'NS1', 'לינק לשיחה': 'https://chat.example/NS1', קופון: 'PTB-ABCDEF0123',
    }]), null));
    for (const secret of ['NS1', 'chat.example', 'לקוח בדיוני', '0500000009', 'z@example.com', 'ABCDEF0123', 'user_ns']) expect(json).not.toContain(secret);
  });
});
