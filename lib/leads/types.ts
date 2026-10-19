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
  /**
   * "התחיל שיחה" (עמודה BD), ממולא על ידי סוכן AI שקורא את השיחות: האם הייתה שיחה אמיתית עם הסוכן,
   * מעבר ל"היי" או הודעה כללית. null = הסוכן עוד לא קרא את השיחה.
   */
  aiConversation: 'yes' | 'no' | null;
  step: number | null;
  score: number | null;
  /** "מבחן" */
  test: string | null;
  /** "מוצר שנקנה", null כשריק או "-" */
  product: string | null;
  amount: number | null;
  /** "הסיר את עצמו?": בטבלה כתוב שם תאריך ההסרה */
  removedAt: string | null;
  /** "אופן שיחה" (עמודה BE), ממולא על ידי סוכן AI: שירותי, מכירתי, טכני, פניית שירות... (רשימה פתוחה) */
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
