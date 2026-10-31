import type { Lead, LeadsFile, MailingPurchase, MailingWave, Purchase } from './types';

/** בקובץ לא נשמרים שדות ריקים (null או false), כדי שיהיה קטן. unpack משלים אותם. */
export function pack(file: LeadsFile): string {
  return JSON.stringify(file, (_k, v) => (v === null || v === false ? undefined : v));
}

const EMPTY_LEAD: Lead = {
  at: '', source: null, sourceGroup: null, process: null, status: null, qStatus: null, answered: false, aiConversation: null,
  step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null,
  campaign: null, messages: null, botCoupon: false, couponAt: null, firstAt: null,
};

const EMPTY_PURCHASE: Omit<Purchase, 'buyer'> = {
  at: '', lead: null, product: null, amount: null, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: null, reason: null, coupon: null,
};

const EMPTY_MAILING: Omit<MailingPurchase, 'buyer'> = {
  campaign: '', wave: '', sentAt: null, at: '', product: null, amount: null, viaLink: false, coupon: null, bot: null, reason: null,
};

const EMPTY_WAVE: MailingWave = {
  campaign: '', wave: '', kind: 'wave', sentDay: null, sent: null, undelivered: null, delivered: null, buyers: null, purchases: null, amount: null,
  viaLinkPurchases: null, viaLinkAmount: null, spooky: null, bot: null, note: null,
};

export function unpack(json: unknown): LeadsFile {
  const f = json as Partial<LeadsFile> | null;
  if (!f || f.version !== 2 || !Array.isArray(f.leads) || !Array.isArray(f.purchases)) throw new Error('קובץ הנתונים לא במבנה הצפוי');
  return {
    version: 2,
    origin: f.origin === 'sheet' ? 'sheet' : 'demo',
    generatedAt: f.generatedAt ?? '',
    sheetRows: f.sheetRows ?? f.leads.length,
    purchaseRows: f.purchaseRows ?? f.purchases.length,
    leads: f.leads.map((l) => ({ ...EMPTY_LEAD, ...l })),
    // קובץ ישן בלי מספר קונה: כל רכישה קונה בפני עצמה
    purchases: f.purchases.map((p, i) => ({ ...EMPTY_PURCHASE, ...p, buyer: p.buyer ?? -1 - i })),
    mailings: Array.isArray(f.mailings) ? f.mailings.map((m, i) => ({ ...EMPTY_MAILING, ...m, buyer: m.buyer ?? -1 - i })) : null,
    mailingWaves: Array.isArray(f.mailingWaves) ? f.mailingWaves.map((w) => ({ ...EMPTY_WAVE, ...w })) : null,
  };
}
