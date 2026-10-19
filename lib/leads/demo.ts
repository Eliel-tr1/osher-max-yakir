import type { Lead, LeadStatus, Process, QuestionnaireStatus } from './types';

/**
 * נתוני הדגמה מומצאים לגמרי. אין כאן אף ליד אמיתי.
 * הם נוצרים מאותו זרע בכל פעם, כדי שהבדיקות והצילומים יהיו יציבים.
 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const STATUSES: LeadStatus[] = ['ליד חדש', 'אין מענה', 'עבר', 'לא עבר', null, null];
const PROCESSES: Process[] = ['תהליך ראשי', 'תהליך ראשי', 'הרשמה לאתגר', "צ'אטבוט"];
const PRODUCTS = ['אתגר 21 יום', 'ליווי אישי', 'סדנה מקוונת'];

export function demoLeads(count = 180, until = new Date('2026-10-19T12:00:00+03:00')): Lead[] {
  const rnd = seeded(20261019);
  const out: Lead[] = [];
  const spanMs = 45 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < count; i++) {
    const enteredAt = new Date(until.getTime() - Math.floor(rnd() * spanMs));
    const answered = rnd() < 0.55;
    const step = answered ? Math.floor(rnd() * 11) : null;
    let qs: QuestionnaireStatus = null;
    if (answered && step !== null) {
      qs = step >= 10 ? 'finished' : step > 0 ? 'started' : null;
      if (qs === 'finished' && rnd() < 0.35) qs = rnd() < 0.5 ? 'payment' : 'converted';
    }
    const paid = qs === 'converted';
    out.push({
      id: `DEMO-${String(i + 1).padStart(4, '0')}`,
      enteredAt,
      status: STATUSES[Math.floor(rnd() * STATUSES.length)],
      answeredChatbot: answered,
      questionnaireStep: step,
      questionnaireStatus: qs,
      process: PROCESSES[Math.floor(rnd() * PROCESSES.length)],
      score: answered ? Math.round(rnd() * 70) : null,
      product: paid ? PRODUCTS[Math.floor(rnd() * PRODUCTS.length)] : null,
      amountPaid: paid ? [297, 990, 2400][Math.floor(rnd() * 3)] : null,
    });
  }
  return out.sort((a, b) => b.enteredAt.getTime() - a.enteredAt.getTime());
}
