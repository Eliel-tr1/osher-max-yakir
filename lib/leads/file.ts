import type { Lead, LeadsFile } from './types';

/** בקובץ לא נשמרים שדות ריקים (null או false), כדי שיהיה קטן. unpack משלים אותם. */
export function pack(file: LeadsFile): string {
  return JSON.stringify(file, (_k, v) => (v === null || v === false ? undefined : v));
}

const EMPTY: Lead = {
  at: '', source: null, process: null, status: null, qStatus: null, answered: false,
  step: null, score: null, test: null, product: null, amount: null, removedAt: null,
};

export function unpack(json: unknown): LeadsFile {
  const f = json as Partial<LeadsFile> | null;
  if (!f || f.version !== 1 || !Array.isArray(f.leads)) throw new Error('קובץ הנתונים לא במבנה הצפוי');
  return {
    version: 1,
    origin: f.origin === 'sheet' ? 'sheet' : 'demo',
    generatedAt: f.generatedAt ?? '',
    sheetRows: f.sheetRows ?? f.leads.length,
    duplicatesRemoved: f.duplicatesRemoved ?? 0,
    skippedRows: f.skippedRows ?? 0,
    leads: f.leads.map((l) => ({ ...EMPTY, ...l })),
  };
}
