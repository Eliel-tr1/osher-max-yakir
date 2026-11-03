import type { PrivateIds, PrivateRows } from './fromSheet';
import type { AnalysisRow, FeedbackRow, InquiryRow, Insights, Lead, Purchase, QuestionRow } from './types';

/**
 * "תובנות שיחה" מומצאות לגמרי, לתצוגה ולצילומים (3/11/2026). שמות, טקסטים ושאלות של הדגמה בלבד.
 * מבוססות על הלידים של ההדגמה, כדי שהסינון לפי מקור ותהליך יעבוד גם כאן.
 */
const PATHS = ['מבחן - לא עבר', 'מבחן - לא עבר', 'פופאפ', 'תהליך ראשי', 'מבחן - עבר', 'הרשמה לאתגר'];
const ABANDON: [string, number][] = [
  ['הפסיק לענות בשאלון', 25], ['נרתע מהמחיר והתוספים', 13], ['הבוט לא נתן מענה או הבטיח ולא קיים', 10], ['קיבל קישור או קופון ולא רכש', 10],
  ['נכשל במבחן ועזב', 8], ['קושי טכני ברכישה', 8], ['חוסר תקציב', 7], ['תסכול מהפרה או חסימה', 6], ['אחר', 5], ['רצה רק קופון הנחה', 4],
  ['אמר שיחזור או ימשיך לבדוק', 2], ['חוסר אמון או מעבר לחברה אחרת', 2],
];
const DETAILS: Record<string, string> = {
  'הפסיק לענות בשאלון': 'ענה על שתי שאלות ועצר (הדגמה)',
  'נרתע מהמחיר והתוספים': 'שאל על מחיר התוספים ולא חזר (הדגמה)',
  'הבוט לא נתן מענה או הבטיח ולא קיים': 'הבוט הבטיח לבדוק ולא חזר עם תשובה (הדגמה)',
  'קיבל קישור או קופון ולא רכש': 'קיבל קופון ולא השתמש בו (הדגמה)',
  'קושי טכני ברכישה': 'התשלום לא עבר בכרטיס (הדגמה)',
};
const STEPS = ['לא התחיל שאלון', 'התחיל שאלון (שלב 2)', 'התחיל שאלון (שלב 3)', 'התחיל שאלון (שלב 5)', 'התחיל שאלון', 'סיים שאלון', 'אחרי מבחן', 'הגיע לתשלום'];
const INQUIRY_CATS: [string, number][] = [
  ['הפעלת חשבון ושדרוג', 28], ['תקלה טכנית בפלטפורמה', 17], ['ערעור על חוקים והפרות', 16], ['מכירות והנחות', 15], ['חסימת מסחר בחשבון', 8],
  ['בקשת נציג כללית', 6], ['תשלומים וחיובים', 5], ['שאלת מוצר ותוספים', 3], ['אחר', 2],
];
const FEEDBACK_CATS: [string, number][] = [
  ['בקשת תנאים גמישים', 22], ['תוכנית לניסיון הבא', 20], ['חוקים לא ברורים', 18], ['טעות אישית במסחר', 17], ['שבע רצון ללא הערות', 8],
  ['בקשת מידע והכוונה', 7], ['אחר', 6],
];
const QUESTIONS: [string, string][] = [
  ['מה מגבלת ההפסד היומית באתגר של הדגמה?', 'חוקי תוכנית ומסחר'], ['אפשר להחזיק עסקה בסוף השבוע?', 'חוקי תוכנית ומסחר'],
  ['האם קופון ההדגמה תקף גם לתוסף?', 'קופונים ומבצעים'], ['כמה עולה התוסף של ההדגמה?', 'מחירי תוספים'], ['איך מפעילים את החשבון אחרי המבחן?', 'הפעלת חשבון וגישה'],
  ['מה קורה אם עברתי את היעד ביום הראשון?', 'חוקי תוכנית ומסחר'], ['יש הנחה לניסיון שני?', 'קופונים ומבצעים'], ['איפה רואים את הסיסמה לפלטפורמה?', 'הפעלת חשבון וגישה'],
  ['מותר לסחור בחדשות?', 'חוקי תוכנית ומסחר'], ['כמה זמן לוקח לקבל את החשבון?', 'הפעלת חשבון וגישה'], ['אפשר לשלם בתשלומים?', 'אחר'],
  ['מה ההבדל בין שני המסלולים?', 'אחר'], ['האם התוסף מחזיר את הכסף?', 'מחירי תוספים'], ['איך מבקשים משיכה?', 'אחר'],
];

function weighted(rnd: () => number, xs: [string, number][]): string {
  const total = xs.reduce((s, x) => s + x[1], 0);
  let r = rnd() * total;
  for (const [name, w] of xs) {
    r -= w;
    if (r <= 0) return name;
  }
  return xs[xs.length - 1][0];
}

export function demoInsights(leads: Lead[], purchases: Purchase[], until: Date, rnd: () => number): { insights: Insights; ids: Pick<PrivateIds, 'analysis' | 'inquiries' | 'feedback' | 'questions'> } {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const readAt = until.toISOString();
  const bought = new Set(purchases.map((p) => p.lead));
  const start = new Date('2026-09-28T00:00:00+03:00').getTime();
  const name = (i: number) => `לקוח הדגמה ${i + 1}`;

  const analysis: AnalysisRow[] = [];
  const ap: PrivateRows = { ns: [], names: [], texts: [] };
  leads.forEach((l, i) => {
    if (new Date(l.at).getTime() < start) return;
    const yes = bought.has(i);
    let reason: string;
    if (yes) reason = rnd() < 0.7 ? 'רכש בלי שיחה' : 'אין נטישה - רכש';
    else if (!l.answered) reason = rnd() < 0.55 ? 'לא כתב לבוט' : 'הודעה בודדת בלבד';
    else if (rnd() < 0.02) reason = 'לא ברור מהסיכום';
    else if (rnd() < 0.015) reason = 'שיחת בדיקה';
    else reason = weighted(rnd, ABANDON);
    const step = yes ? 'רכש' : !l.answered ? 'לא התחיל שאלון' : pick(STEPS);
    analysis.push({
      at: l.at, lead: i, path: l.campaign === 'popup_website' ? 'פופאפ' : pick(PATHS), bought: yes ? 'yes' : 'no', step, reason, agent: rnd() < 0.1,
      inquiry: rnd() < 0.03 ? weighted(rnd, INQUIRY_CATS) : null, unanswered: rnd() < 0.06 ? 1 + Math.floor(rnd() * 2) : 0,
      feedback: rnd() < 0.01 ? weighted(rnd, FEEDBACK_CATS) : null, messages: l.messages, scannedAt: new Date(until.getTime() - Math.floor(rnd() * 8) * 3_600_000).toISOString(),
      removal: rnd() < 0.006 ? pick(['לא מעוניין', 'יותר מדי הודעות', 'אחר']) : null, basis: l.answered ? (rnd() < 0.2 ? 'סיכום' : "צ'אט") : "בלי צ'אט",
    });
    ap.ns.push(`DEMO${i}`);
    ap.names.push(name(i));
    ap.texts.push(DETAILS[reason] ?? (rnd() < 0.4 && !yes ? 'השיחה נקטעה באמצע (הדגמה)' : ''));
  });

  const recent = leads.map((l, i) => ({ l, i })).filter((x) => new Date(x.l.at).getTime() >= new Date('2026-10-02T00:00:00+03:00').getTime());
  const inquiries: InquiryRow[] = [];
  const ip: PrivateRows = { ns: [], names: [], texts: [] };
  const whoOf = new Map<number, number>();
  for (let k = 0; k < 140; k++) {
    const { l, i } = pick(recent);
    const at = new Date(new Date(l.at).getTime() + Math.floor(rnd() * 3 * 86_400_000));
    if (at > until) continue;
    if (!whoOf.has(i)) whoOf.set(i, whoOf.size);
    const category = rnd() < 0.09 ? null : weighted(rnd, INQUIRY_CATS);
    inquiries.push({ at: at.toISOString(), lead: i, who: whoOf.get(i)!, category });
    ip.ns.push(`DEMO${i}`);
    ip.names.push(name(i));
    ip.texts.push(`פנייה לדוגמה: ${category ?? 'שאלה כללית'} (הדגמה)`);
  }
  inquiries.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));

  const feedback: FeedbackRow[] = [];
  const fp: PrivateRows = { ns: [], names: [], texts: [] };
  const fWho = new Map<number, number>();
  for (let k = 0; k < 70; k++) {
    const { l, i } = pick(recent);
    if (!fWho.has(i)) fWho.set(i, fWho.size);
    feedback.push({ at: l.at, lead: i, who: fWho.get(i)!, category: rnd() < 0.04 ? null : weighted(rnd, FEEDBACK_CATS), exam: rnd() < 0.18 ? 'passed' : rnd() < 0.85 ? 'failed' : null });
    fp.ns.push(`DEMO${i}`);
    fp.names.push(name(i));
    fp.texts.push(pick(['הייתי רוצה עוד יום לאתגר (הדגמה)', 'החוקים לא היו ברורים לי (הדגמה)', 'בפעם הבאה אנסה אחרת (הדגמה)', '']));
  }

  const questions: QuestionRow[] = QUESTIONS.map(([text, category], k) => ({
    text, category, count: k < 4 ? 2 + Math.floor(rnd() * 4) : 1 + (rnd() < 0.3 ? 1 : 0),
    lastAt: new Date(until.getTime() - Math.floor(rnd() * 20) * 86_400_000).toISOString(), status: k === 1 ? 'נענה' : k === 3 ? 'עודכן במאגר' : 'ממתין לתשובה',
    answer: k === 1 ? 'אפשר, לפי חוקי התוכנית של ההדגמה' : k === 3 ? 'המחיר מופיע בעמוד התוספים (הדגמה)' : null,
  }));

  return {
    insights: {
      analysis: { readAt, rows: analysis }, questions: { readAt, rows: questions }, inquiries: { readAt, rows: inquiries }, feedback: { readAt, rows: feedback },
    },
    ids: { analysis: ap, inquiries: ip, feedback: fp, questions: questions.map((_, k) => [`DEMO${k}`]) },
  };
}
