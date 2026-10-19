/**
 * ליד אחד אחרי ניקוי, כפי שהוא נשמר בקובץ הנתונים שעולה לשרת.
 * בלי שם, טלפון, מייל, קישור לשיחה, קוד מזהה או הערות: הקובץ נגיש לכל מי שיש לו את הכתובת.
 */
export interface Lead {
  /** תאריך כניסה, ISO */
  at: string;
  source: string | null;
  process: string | null;
  /** "סטטוס": ליד חדש / אין מענה / עבר / לא עבר */
  status: string | null;
  /** "סטטוס שאלון", באותיות קטנות: started / finished / payment / converted */
  qStatus: string | null;
  /** "ענה לצ'אטבוט?" (עמודה I) */
  answered: boolean;
  /** "התחיל שיחה" (עמודה BD, ימולא על ידי סוכן AI): התחיל את המסע */
  started: boolean;
  step: number | null;
  score: number | null;
  /** "מבחן" */
  test: string | null;
  /** "מוצר שנקנה", null כשריק או "-" */
  product: string | null;
  amount: number | null;
  /** "הסיר את עצמו?": בטבלה כתוב שם תאריך ההסרה */
  removedAt: string | null;
  /** "אופן שיחה" (עמודה BE, ימולא על ידי סוכן AI): שירות / מכירותי / גם וגם / אין שיחה */
  mode: string | null;
}

export interface LeadsFile {
  version: 1;
  /** demo = נתוני הדגמה מומצאים; sheet = הטבלה האמיתית */
  origin: 'demo' | 'sheet';
  generatedAt: string;
  /** שורות עם נתונים בטבלה, לפני ניקוי */
  sheetRows: number;
  duplicatesRemoved: number;
  /** שורות בלי תאריך כניסה תקין */
  skippedRows: number;
  leads: Lead[];
}
