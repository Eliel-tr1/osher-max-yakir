import type { Lead, LeadsFile, Purchase } from './types';

/** בקובץ לא נשמרים שדות ריקים (null או false), כדי שיהיה קטן. unpack משלים אותם. */
export function pack(file: LeadsFile): string {
  return JSON.stringify(file, (_k, v) => (v === null || v === false ? undefined : v));
}

const EMPTY_LEAD: Lead = {
  at: '', source: null, sourceGroup: null, process: null, status: null, qStatus: null, answered: false, aiConversation: null,
  step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null,
};

const EMPTY_PURCHASE: Purchase = { at: '', lead: null, product: null, amount: null, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: null };

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
    purchases: f.purchases.map((p) => ({ ...EMPTY_PURCHASE, ...p })),
  };
}
