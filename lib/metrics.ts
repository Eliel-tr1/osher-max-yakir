import type { Lead } from './leads/types';

export interface Range {
  /** כולל */
  from: Date;
  /** לא כולל */
  to: Date;
}

export interface Summary {
  leads: number;
  answered: number;
  answeredRate: number | null;
  finishedQuestionnaire: number;
  paid: number;
  revenue: number;
}

const FINISHED = new Set(['finished', 'payment', 'converted']);

export function inRange(leads: Lead[], range: Range): Lead[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return leads.filter((l) => {
    const t = l.enteredAt.getTime();
    return t >= from && t < to;
  });
}

export function summarize(leads: Lead[]): Summary {
  const answered = leads.filter((l) => l.answeredChatbot).length;
  const paidLeads = leads.filter((l) => (l.amountPaid ?? 0) > 0);
  return {
    leads: leads.length,
    answered,
    answeredRate: leads.length ? answered / leads.length : null,
    finishedQuestionnaire: leads.filter((l) => l.questionnaireStatus && FINISHED.has(l.questionnaireStatus)).length,
    paid: paidLeads.length,
    revenue: paidLeads.reduce((sum, l) => sum + (l.amountPaid ?? 0), 0),
  };
}

/** "09/07/2025 22:24" או "09/07/2025" -> Date בשעון ישראל. מחזיר null כשהערך לא תאריך. */
export function parseSheetDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(Number(y), month, 0)).getUTCDate()) return null;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${s.padStart(2, '0')}`;
  // ישראל: +03:00 בקיץ, +02:00 בחורף. Intl יודע מה נכון לכל תאריך.
  return new Date(`${iso}${israelOffset(iso)}`);
}

function israelOffset(isoLocal: string): string {
  const guess = new Date(`${isoLocal}Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' })
    .formatToParts(guess)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+02:00';
}

/** "- 990", "₪2,400", "990" -> מספר. ריק או לא מספר -> null. */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
