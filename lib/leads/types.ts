/**
 * ליד אחד אחרי ניקוי, כפי שהוא נשמר בקובץ הנתונים שעולה לשרת.
 * בלי שם, טלפון, מייל, קישור לשיחה, קוד מזהה או הערות: הקובץ נגיש לכל מי שיש לו את הכתובת.
 * ליד = אדם אחד, לפי "קוד מזהה" (החלטת המנהל, #21). רכישות מצביעות על הליד שלהן לפי המיקום במערך (`lead`).
 */
export interface Lead {
  /** תאריך כניסה, ISO */
  at: string;
  /** "מקור הגעה" כמו שכתוב */
  source: string | null;
  /**
   * קבוצת המקור: "בוט וואטסאפ" (אורגני), "מהאתר (מבחן או רכישה)" כשכתוב שם של מבחן או מוצר,
   * ואחרת שם הערוץ כמו שכתוב (ig, google, Klaviyo, vitrue...). null כשאין מקור.
   */
  sourceGroup: string | null;
  process: string | null;
  /** "סטטוס": ליד חדש / אין מענה / עבר / לא עבר / לקוח פעיל */
  status: string | null;
  /** "סטטוס שאלון", באותיות קטנות: started / finished / payment / converted */
  qStatus: string | null;
  /** "ענה לצ'אטבוט?" (עמודה I) */
  answered: boolean;
  /**
   * "התחיל שיחה" (עמודה BD), ממולא על ידי סוכן AI שקורא את השיחות: האם הייתה שיחה אמיתית,
   * מעבר ל"היי" או הודעה כללית. null = הסוכן עוד לא קרא את השיחה.
   */
  aiConversation: 'yes' | 'no' | null;
  step: number | null;
  score: number | null;
  /** "מבחן" */
  test: string | null;
  /** "מוצר שנקנה", null כשריק או "-" */
  product: string | null;
  /** "סכום ששולם" של השורה בלשונית הלידים (הרכישה האחרונה). הרכישות עצמן ב-purchases */
  amount: number | null;
  /** "הסיר את עצמו?": בטבלה כתוב שם תאריך ההסרה */
  removedAt: string | null;
  /** "אופן שיחה" (עמודה BE), ממולא על ידי סוכן AI: מכירתית או שירותית */
  mode: string | null;
}

/** רכישה אחת מלשונית "רכישות". בלי שם, טלפון או קוד מזהה. */
export interface Purchase {
  /** תאריך הרכישה, ISO */
  at: string;
  /** המיקום של הליד במערך leads, או null כשהקונה לא נמצא בלשונית הלידים */
  lead: number | null;
  /** שם המוצר. null כשלא נרשם */
  product: string | null;
  /** null כשאין סכום. רכישה בלי סכום נספרת, אבל לא נכנסת לסכומים ולממוצע (החלטת המנהל, 29/10) */
  amount: number | null;
  /** "מקור הגעה" של הרכישה: ה-utm_source שהגיע עם הרכישה, או שם המוצר כשלא היה utm */
  source: string | null;
  /** כמו sourceGroup של ליד */
  sourceGroup: string | null;
  /** utm_campaign, כשהעמודה קיימת */
  campaign: string | null;
  /** הרכישה לא מופיעה בלשונית "רכישות" ונלקחה משורת הליד (קונים ישנים) */
  fromLead: boolean;
}

export interface LeadsFile {
  version: 2;
  /** demo = נתוני הדגמה מומצאים; sheet = הטבלה האמיתית */
  origin: 'demo' | 'sheet';
  generatedAt: string;
  /** שורות עם נתונים בלשונית הלידים, לפני ניקוי */
  sheetRows: number;
  /** שורות עם נתונים בלשונית הרכישות, לפני ניקוי */
  purchaseRows: number;
  leads: Lead[];
  purchases: Purchase[];
}
