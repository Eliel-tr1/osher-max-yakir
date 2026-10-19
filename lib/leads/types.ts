/** ליד אחד, אחרי ניקוי. רק השדות שהדשבורד צריך - בלי שם, טלפון ומייל. */
export type LeadStatus = 'ליד חדש' | 'אין מענה' | 'עבר' | 'לא עבר' | null;

export type QuestionnaireStatus = 'started' | 'finished' | 'payment' | 'converted' | null;

export type Process = 'תהליך ראשי' | 'הרשמה לאתגר' | "צ'אטבוט" | null;

export interface Lead {
  id: string;
  enteredAt: Date;
  status: LeadStatus;
  answeredChatbot: boolean;
  questionnaireStep: number | null;
  questionnaireStatus: QuestionnaireStatus;
  process: Process;
  score: number | null;
  product: string | null;
  amountPaid: number | null;
}

/** מאיפה הגיעו הנתונים שמוצגים, כדי שהמסך תמיד יגיד את זה בבירור. */
export type LeadsSource = 'demo' | 'sheet';

export interface LeadsResult {
  source: LeadsSource;
  leads: Lead[];
  fetchedAt: Date;
}
