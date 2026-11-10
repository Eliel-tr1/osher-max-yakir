import type { AnalysisRow, FeedbackRow, InquiryRow, Insights, StallRow, Lead, LeadsFile, MailingPurchase, MailingWave, Part, Purchase, QuestionRow } from './types';

/** בקובץ לא נשמרים שדות ריקים (null או false), כדי שיהיה קטן. unpack משלים אותם. */
export function pack(file: LeadsFile): string {
  return JSON.stringify(file, (_k, v) => (v === null || v === false ? undefined : v));
}

const EMPTY_LEAD: Lead = {
  at: '', source: null, sourceGroup: null, process: null, status: null, qStatus: null, answered: false, aiConversation: null,
  step: null, score: null, test: null, product: null, amount: null, removedAt: null, mode: null,
  campaign: null, messages: null, botCoupon: false, couponAt: null, firstAt: null, person: -1,
};

const EMPTY_PURCHASE: Omit<Purchase, 'buyer' | 'person'> = {
  at: '', lead: null, product: null, amount: null, source: null, sourceGroup: null, campaign: null, fromLead: false, bot: null, reason: null, coupon: null,
};

const EMPTY_MAILING: Omit<MailingPurchase, 'buyer'> = {
  campaign: '', wave: '', sentAt: null, at: '', product: null, amount: null, viaLink: false, coupon: null, bot: null, reason: null,
};

const EMPTY_WAVE: MailingWave = {
  campaign: '', wave: '', kind: 'wave', sentDay: null, sent: null, undelivered: null, delivered: null, buyers: null, purchases: null, amount: null,
  viaLinkPurchases: null, viaLinkAmount: null, spooky: null, bot: null, note: null,
};

const EMPTY_ANALYSIS: AnalysisRow = {
  at: null, lead: null, path: null, bought: null, step: null, reason: null, agent: false, inquiry: null, unanswered: null, feedback: null,
  messages: null, scannedAt: null, removal: null, basis: null,
};
const EMPTY_QUESTION: QuestionRow = { text: '', category: null, count: 0, lastAt: null, status: null, answer: null };
const EMPTY_INQUIRY: Omit<InquiryRow, 'who'> = { at: null, lead: null, category: null };
const EMPTY_FEEDBACK: Omit<FeedbackRow, 'who'> = { at: null, lead: null, category: null, exam: null };
const EMPTY_STALL: StallRow = { at: null, lead: null, process: null, stop: null, detail: null, messages: null, lastAt: null, scannedAt: null };

/** חלק של תובנות השיחה: שורות עם ערכי ברירת מחדל, או null כשהחלק לא קיים */
function partOf<T>(p: unknown, fill: (row: Partial<T>, i: number) => T): Part<T> | null {
  const x = p as Partial<Part<T>> | null | undefined;
  if (!x || !Array.isArray(x.rows)) return null;
  return { readAt: typeof x.readAt === 'string' ? x.readAt : '', rows: x.rows.map((r, i) => fill(r as Partial<T>, i)) };
}

export function unpackInsights(json: unknown): Insights {
  const x = (json ?? {}) as Partial<Record<keyof Insights, unknown>>;
  return {
    analysis: partOf<AnalysisRow>(x.analysis, (r) => ({ ...EMPTY_ANALYSIS, ...r })),
    questions: partOf<QuestionRow>(x.questions, (r) => ({ ...EMPTY_QUESTION, ...r })),
    inquiries: partOf<InquiryRow>(x.inquiries, (r, i) => ({ ...EMPTY_INQUIRY, ...r, who: r.who ?? -1 - i })),
    feedback: partOf<FeedbackRow>(x.feedback, (r, i) => ({ ...EMPTY_FEEDBACK, ...r, who: r.who ?? -1 - i })),
    stalls: partOf<StallRow>(x.stalls, (r) => ({ ...EMPTY_STALL, ...r })),
  };
}

export function unpack(json: unknown): LeadsFile {
  const f = json as Partial<LeadsFile> | null;
  if (!f || f.version !== 2 || !Array.isArray(f.leads) || !Array.isArray(f.purchases)) throw new Error('קובץ הנתונים לא במבנה הצפוי');
  return {
    version: 2,
    origin: f.origin === 'sheet' ? 'sheet' : 'demo',
    generatedAt: f.generatedAt ?? '',
    sheetRows: f.sheetRows ?? f.leads.length,
    purchaseRows: f.purchaseRows ?? f.purchases.length,
    // קובץ ישן בלי מספר אדם: כל ליד ורכישה אדם בפני עצמו
    leads: f.leads.map((l, i) => ({ ...EMPTY_LEAD, ...l, person: l.person ?? -1e6 - i })),
    // קובץ ישן בלי מספר קונה: כל רכישה קונה בפני עצמה
    purchases: f.purchases.map((p, i) => ({ ...EMPTY_PURCHASE, ...p, buyer: p.buyer ?? -1 - i, person: p.person ?? -2e6 - i })),
    mailings: Array.isArray(f.mailings) ? f.mailings.map((m, i) => ({ ...EMPTY_MAILING, ...m, buyer: m.buyer ?? -1 - i })) : null,
    mailingWaves: Array.isArray(f.mailingWaves) ? f.mailingWaves.map((w) => ({ ...EMPTY_WAVE, ...w })) : null,
    dupes: Array.isArray(f.dupes) ? f.dupes : [],
    // קובץ בלי תובנות שיחה (לפני 3/11/2026): כל החלקים חסרים
    insights: unpackInsights(f.insights),
  };
}
