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
  /** "utm_campaign" (עמודה BH): הקמפיין של האדם ב-CloudChat, למשל popup_website. מאפיין של האדם */
  campaign: string | null;
  /** "הודעות לקוח" (עמודה BI): כמה הודעות הלקוח כתב לבוט. null = לא ידוע */
  messages: number | null;
  /** "קופון הבוט" (עמודה BJ) מלא. הקוד עצמו לא נשמר */
  botCoupon: boolean;
  /** "תאריך קופון" (עמודה BK), ISO של תחילת היום */
  couponAt: string | null;
  /** "תאריך כניסה" המוקדם ביותר של האדם, כשהוא מוקדם מ-at (לאדם כמה שורות). אחרת null */
  firstAt: string | null;
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
  /**
   * עמודה "של הבוט" בלשונית "רכישות", שהסוכן של המנהל ממלא בסריקת הלילה (החלטת המנהל, 29/10/2026).
   * 'yes' = "כן" בדיוק (אחרי הסרת רווחים בקצוות). 'no' = כל ערך אחר. null = עוד לא הוכרע: תא ריק,
   * עמודה שלא קיימת, או רכישה שנלקחה משורת ליד.
   */
  bot: 'yes' | 'no' | null;
  /** "סיבה" (עמודה O): למה הוחלט כך, כמו שהסוכן כתב. null = ריק */
  reason: string | null;
  /**
   * "קופון מהרכישה" (עמודה M) אחרי איחוד: JSON או טקסט, באותיות גדולות. קופון אישי של הבוט (PTB- ו-10 תווים
   * הקסדצימליים) נשמר רק כקבוצה ("קופון אישי של הבוט"), בלי הקוד. null = בלי קופון
   */
  coupon: string | null;
  /** מספר סידורי של הקונה (קוד מזהה שונה = מספר שונה), לספירת קונים. לא הקוד עצמו */
  buyer: number;
}

/** רכישה אחת מלשונית "דיוורים". בלי קוד מזהה ובלי קישור לשיחה. */
export interface MailingPurchase {
  campaign: string;
  /** "גל" כמו שכתוב, למשל "גל 1 · 28/10" */
  wave: string;
  /** תאריך השליחה לנמען, ISO. null למי שלא היה נמען */
  sentAt: string | null;
  /** תאריך הרכישה, ISO */
  at: string;
  /** מספר סידורי של הקונה בתוך הלשונית */
  buyer: number;
  product: string | null;
  amount: number | null;
  /** "דרך קישור הקמפיין" = כן */
  viaLink: boolean;
  /** כמו Purchase.coupon */
  coupon: string | null;
  bot: 'yes' | 'no' | null;
  reason: string | null;
}

/** שורה מלשונית "דיוורים - סיכום". כל המספרים כמו שכתובים שם. */
export interface MailingWave {
  campaign: string;
  wave: string;
  /** wave = גל שליחה; others = רכישות של מי שלא היה נמען; total = סה"כ */
  kind: 'wave' | 'others' | 'total';
  /** "תאריך שליחה" כמו שכתוב */
  sentDay: string | null;
  sent: number | null;
  undelivered: number | null;
  delivered: number | null;
  buyers: number | null;
  purchases: number | null;
  amount: number | null;
  viaLinkPurchases: number | null;
  viaLinkAmount: number | null;
  spooky: number | null;
  bot: number | null;
  note: string | null;
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
  /** לשונית "דיוורים". null = הלשונית חסרה או בלי העמודות הצפויות (הסקשן מוסתר) */
  mailings: MailingPurchase[] | null;
  /** לשונית "דיוורים - סיכום". null = חסרה */
  mailingWaves: MailingWave[] | null;
}
