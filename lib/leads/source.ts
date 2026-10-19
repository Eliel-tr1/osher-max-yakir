import { demoLeads } from './demo';
import type { LeadsResult } from './types';

/**
 * המקום היחיד שממנו הדשבורד מקבל לידים.
 * היום: נתוני הדגמה בלבד. הקריאה מגוגל שיטס תיכנס כאן ב-#9, בלי לשנות את המסכים.
 */
export async function getLeads(): Promise<LeadsResult> {
  return { source: 'demo', leads: demoLeads(), fetchedAt: new Date() };
}
