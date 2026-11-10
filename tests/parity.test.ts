import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pack } from '../lib/leads/file';
import {
  ANALYSIS_COLUMNS, ANALYSIS_OPTIONAL, buildData, FEEDBACK_COLUMNS, INQUIRY_COLUMNS, leadsFromRows, MAILING_COLUMNS, MAILING_WAVE_COLUMNS, OPTIONAL_COLUMNS, PURCHASE_COLUMNS,
  REQUIRED_COLUMNS, STALL_COLUMNS, STALL_OPTIONAL, type InsightRows,
} from '../lib/leads/fromSheet';
import { parseCsv } from '../lib/sheet/parse';

/**
 * השרת מעבד את הטבלה ב-PHP (public/_leads.php), והבנייה בגיטהאב ב-TypeScript.
 * הבדיקה הזו מריצה את שניהם על אותן טבלאות מדומות ודורשת תוצאה זהה.
 */
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const two = (x: number) => String(x).padStart(2, '0');
const PRODUCTS = ['', '-', ' - ', 'Lightning Pro', 'Lightning challenge 1 step<span> - </span>MT5, 100k', 'funded activation fee', 'שורה\nשנייה', 'בדיקת n8n', 'Instant'];
const TESTS = ['', 'One Step Assessment - 100K - MT5', 'Freedom Challenge - MT5 - 20k'];
const SOURCES = ["אורגני - צ'אטבוט וואטסאפ", 'צאטבוט', '  ריווח מיוחד  ', 'Lightning Pro', 'ig', 'vitrue', 'One Step Assessment - 100K - MT5', ''];

/** טבלת לידים מדומה עם כל המקרים הקשים: מרכאות, שורות בתוך תא, HTML, כפילויות, תאריכים שבורים וישנים, רווחים מיוחדים */
const COUPONS = ['', '-', 'empty', 'EMPTY', ' pass50 ', '{"code":"spooky","discount":"10"}', '{"code":"","discount":""}', '{"discount":"5"}', '{bad json',
  'PTB-1A2B3C4D5E', 'ptb-1a2b3c4d5e', 'PTB-FLASH25', '{"code":"PTB-00FF00FF00"}', '{"code":null}'];

function fixture(n: number, extraHeader = true): { leads: string; purchases: string } {
  const rnd = seeded(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const header = ['שם לקוח', ...REQUIRED_COLUMNS, 'טלפון', 'מייל', 'הערות', ...(extraHeader ? ['עמודה עתידית', ...OPTIONAL_COLUMNS] : [])];
  const pheader = ['שם לקוח', ...PURCHASE_COLUMNS, 'טלפון', ...(extraHeader ? ['קופון מהרכישה', 'utm_campaign', 'של הבוט', 'סיבה'] : [])];
  const lines = [`﻿${header.map(q).join(',')}`];
  const plines = [pheader.map(q).join(',')];
  const date = (year = 2026) => {
    const day = 1 + Math.floor(rnd() * 28);
    const month = pick([3, 8, 9, 10, 11]); // כולל מעבר שעון קיץ/חורף ותאריכים לפני ההשקה
    return `${two(day)}/${two(month)}/${year} ${two(Math.floor(rnd() * 24))}:${two(Math.floor(rnd() * 60))}:${two(Math.floor(rnd() * 60))}`;
  };
  for (let i = 0; i < n; i++) {
    const id = rnd() < 0.03 ? '' : `ID${i}`;
    const amount = pick(['', '99', '99.99', '- 990', '€2,400', '.', '0', '29']);
    const v: Record<string, string> = {
      'שם לקוח': pick(['ישראל ישראלי', ' ', 'Test, "Name"']),
      'קוד מזהה': id,
      'תאריך כניסה': rnd() < 0.02 ? pick(['', '31/02/2026', '2026-10-01', 'לא תאריך']) : date(rnd() < 0.03 ? 2025 : 2026),
      טלפון: pick(['0501111111', '+972-50-111-1111', '']),
      מייל: pick(['', 'A@Example.com', 'b@example.com']),
      'מקור הגעה': pick(SOURCES),
      סטטוס: pick(['', 'עבר', 'לא עבר', 'ליד חדש', 'לקוח פעיל']),
      'הסיר את עצמו?': rnd() < 0.05 ? pick(['24/09/2026 11:58', 'כן']) : '',
      "ענה לצ'אטבוט?": pick(['', 'כן']),
      'שלב בשאלון': pick(['', '0', '3', '10', '2.5', 'abc']),
      'סטטוס שאלון': pick(['', 'Converted', 'payment', 'finished', 'started', 'irrelevant']),
      'שם תהליך': pick(['תהליך ראשי', 'הרשמה לאתגר', '']),
      'ניקוד לקוח': pick(['', '12', '70', '-3']),
      מבחן: pick(TESTS),
      'מוצר שנקנה': pick(PRODUCTS),
      'סכום ששולם': amount,
      הערות: pick(['', 'הערה "פנימית"', 'a,b']),
      'עמודה עתידית': 'x',
      'התחיל שיחה': pick(['', 'כן', 'לא', 'TRUE', 'false', '0']),
      'אופן שיחה': pick(['', 'שירותית', 'מכירתי', 'מכירתית', 'אין שיחה']),
      utm_campaign: pick(['', '', 'popup_website', 'campaignname', '{campaignname}', ' [UK] - CBO - 27/07 ']),
      'הודעות לקוח': pick(['', '0', '1', '2', '17', 'x']),
      'קופון הבוט': pick(['', '', '', 'PTB-1A2B3C4D5E']),
      'תאריך קופון': pick(['', '28/10/2026', '1/9/2026', 'לא תאריך']),
    };
    lines.push(header.map((h) => q(v[h] ?? '')).join(','));
    if (rnd() < 0.15) {
      // כפילות: אותו קוד מזהה, אותה שנייה או כמה שניות אחרי, עם פחות או יותר נתונים
      const copy: Record<string, string> = {
        ...v, הערות: rnd() < 0.5 ? '' : 'עוד', 'סטטוס שאלון': pick([v['סטטוס שאלון'], 'converted']), 'תאריך כניסה': rnd() < 0.5 ? v['תאריך כניסה'] : date(),
      };
      lines.push(header.map((h) => q(copy[h] ?? '')).join(','));
    }
    if (rnd() < 0.03) lines.push(header.map(() => '').join(','));
    // רכישות: לרוב הקונים שורה או שתיים, לפעמים כפולה, לפעמים בלי שם מוצר או בלי סכום
    const buys = rnd() < 0.5 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0;
    for (let k = 0; k < buys; k++) {
      const d = date(rnd() < 0.02 ? 2023 : 2026).slice(0, 16);
      const p: Record<string, string> = {
        'שם לקוח': v['שם לקוח'], תאריך: d, 'קוד מזהה': rnd() < 0.05 ? `OTHER${i}` : id, 'מקור הגעה': pick(SOURCES),
        'מוצר שנקנה': rnd() < 0.3 ? pick(['', '-']) : pick(PRODUCTS), 'סכום ששולם': rnd() < 0.3 ? amount : pick(['', '5', '14', '169']),
        טלפון: v['טלפון'], utm_campaign: pick(['', 'halloween_lightning']),
        'של הבוט': pick(['', 'כן', ' כן ', 'לא', 'yes', 'כן.', '\u00a0כן\u00a0', 'כ ן']),
        'קופון מהרכישה': pick(COUPONS),
        סיבה: pick(['', 'שיחה מכירתית לפני הרכישה', 'לא כתב לבוט', ' קופון הבוט (נוצר לאיש קשר אחר של הלקוח) ']),
      };
      plines.push(pheader.map((h) => q(p[h] ?? '')).join(','));
      if (rnd() < 0.2) {
        const [dd, hm] = d.split(' ');
        const [hh, mm] = hm.split(':').map(Number);
        const again: Record<string, string> = { ...p, תאריך: `${dd} ${two(hh)}:${two(Math.min(59, mm + (rnd() < 0.5 ? 1 : 5)))}` };
        plines.push(pheader.map((h) => q(again[h] ?? '')).join(','));
      }
    }
  }
  return { leads: lines.join(rnd() < 0.5 ? '\r\n' : '\n'), purchases: plines.join('\r\n') };
}

/** לשוניות "דיוורים" ו"דיוורים - סיכום" מדומות */
function mailingFixture(): { mailings: string; waves: string } {
  const rnd = seeded(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const mh = [...MAILING_COLUMNS, 'לינק לשיחה'];
  const ml = [mh.map(q).join(',')];
  for (let i = 0; i < 80; i++) {
    const recipient = rnd() < 0.9;
    const v: Record<string, string> = {
      קמפיין: pick(['halloween_lightning', 'halloween_lightning', 'black_friday']), גל: recipient ? pick(['גל 1 · 28/10', 'גל 2 · 29/10']) : 'לא נמען / לפני השליחה שלו',
      'תאריך שליחה': recipient ? pick(['28/10/2026 11:00', '29/10/2026 09:30']) : '', 'תאריך רכישה': pick(['28/10/2026 12:15', '30/10/2026 08:01', '', 'שבור']),
      'קוד מזהה': pick(['A', 'B', 'C', '', 'D']), מוצר: pick(['Lightning Pro', 'Instant Funding account<span> - </span>MT5, 5k', '']), סכום: pick(['169', '19.37', '', '€2,400']),
      'דרך קישור הקמפיין': pick(['כן', 'לא', '']), קופון: pick(COUPONS), 'של הבוט': pick(['כן', 'לא', '']), סיבה: pick(['קישור הבוט (vitrue)', '']), 'לינק לשיחה': 'https://example.com/x',
    };
    ml.push(mh.map((h) => q(v[h] ?? '')).join(','));
  }
  const wl = [MAILING_WAVE_COLUMNS.map(q).join(',')];
  wl.push(['halloween_lightning', 'גל 1 · 28/10', '28/10/2026', '200', '14', '186', '18', '23', '2367.22', '3', '93.55', '5', '22', 'שידור אחד, "מהיר"'].map(q).join(','));
  wl.push(['halloween_lightning', 'לא נמען / לפני השליחה שלו', '', '', '', '', '2', '2', '85.5', '2', '85.5', '2', '2', ''].map(q).join(','));
  wl.push(['halloween_lightning', 'סה"כ נמענים', '28-31/10/2026', '900', '121', '779', '47', '58', '5436.28', '18', '630.99', '20', '54', 'הערה'].map(q).join(','));
  return { mailings: ml.join('\r\n'), waves: wl.join('\n') };
}

/** ארבע הלשוניות של תובנות השיחה, עם כל המקרים הקשים: שתי צורות תאריך, תאריך בלי שעה ושבור, טקסט ארוך ואמוג'י, שם חסר */
function insightsFixture(n: number): { analysis: string; questions: string; inquiries: string; feedback: string; stalls: string } {
  const rnd = seeded(303);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const dates = ['02/11/2026 10:47', '3/11/2026 10:47', '03/11/2026 08:35:00', '01/10/2026 09:00', '15/10/2026', '31/02/2026 10:00', '', 'שבור'];
  const long = `${'מילה '.repeat(130)}😀 סוף`;
  const ah = [...ANALYSIS_COLUMNS, ...ANALYSIS_OPTIONAL, 'סומן ב-CloudChat'];
  const al = [ah.map(q).join(',')];
  for (let i = 0; i < n; i++) {
    const v: Record<string, string> = {
      'קוד מזהה': pick([`ID${i}`, `ID${i}`, `NEW${i}`, '']), 'תאריך כניסה': pick(dates), מסלול: pick(['מבחן - עבר', 'מבחן - לא עבר', 'פופאפ', 'תהליך ראשי', 'הרשמה לאתגר', '']),
      קנה: pick(['כן', 'לא', ' לא ', 'אולי', '']), 'שלב אחרון': pick(['לא התחיל שאלון', 'התחיל שאלון (שלב 3)', 'התחיל שאלון', 'רכש', '']),
      'סיבת נטישה': pick(['הפסיק לענות בשאלון', 'שיחת בדיקה', 'אין נטישה - רכש', 'לא ברור מהסיכום', 'הבוט לא נתן מענה או הבטיח ולא קיים', '']),
      'פירוט קצר': pick(['', 'שאל על המחיר, "יקר"', long, 'שורה\nשנייה']), 'פנה לנציג': pick(['כן', 'לא', '']), 'קטגוריית פנייה': pick(['', 'מכירות והנחות']),
      'שאלות ללא מענה': pick(['0', '2', '', 'x']), 'קטגוריית משוב': pick(['', 'אחר']), 'הודעות לקוח': pick(['', '5', '1.5']), 'נסרק ב:': pick(['03/11/2026 05:12:09', '']),
      'סיבת הסרה': pick(['', '', 'לא מעוניין']), 'מקור הסיבה': pick(["צ'אט", 'סיכום', "בלי צ'אט"]), 'סומן ב-CloudChat': 'x',
    };
    al.push(ah.map((h) => q(v[h] ?? '')).join(','));
  }
  const qh = ['שאלה', 'קטגוריה', 'מופעים', 'נשאל לאחרונה', 'דוגמאות (קוד מזהה)', 'סטטוס', 'תשובת יקיר', 'הערות'];
  const ql = [qh.map(q).join(',')];
  for (let i = 0; i < 40; i++) {
    ql.push([pick(['מה המגבלה היומית?', 'כמה עולה תוסף, "פרו"?', '', ' ']), pick(['חוקי תוכנית ומסחר', '']), pick(['1', '3', '', 'x']), pick(dates),
      pick(['A1', 'A1, B2,C3', 'A1 B2\nC3', '']), pick(['ממתין לתשובה', 'נענה', '']), pick(['', 'תשובה, עם "מרכאות"']), 'הערה'].map(q).join(','));
  }
  const ih = ['תאריך פניה', ...INQUIRY_COLUMNS.slice(1), 'שם לקוח', 'טלפון', 'סוג פניה', 'תוכן הפניה', 'לינק לשיחה', 'סומן ב-CloudChat'];
  const il = [ih.map(q).join(',')];
  for (let i = 0; i < n; i++) {
    il.push(ih.map((h) => q(({
      'תאריך פניה': pick(dates), 'מזהה לקוח': pick([`ID${i}`, `ID${i % 7}`, '']), קטגוריה: pick(['הפעלת חשבון ושדרוג', 'אחר', '']), 'שם לקוח': pick(['', 'לקוח, "בדיקה"']),
      'תוכן הפניה': pick(['', long, 'שלום,\nיש לי שאלה']), טלפון: '050', 'סוג פניה': 'ישן', 'לינק לשיחה': 'https://example.com', 'סומן ב-CloudChat': '',
    } as Record<string, string>)[h] ?? '')).join(','));
  }
  const fh = [...FEEDBACK_COLUMNS.slice(0, 2), 'שם לקוח', 'הערות', FEEDBACK_COLUMNS[2], 'מבחן'];
  const fl = [fh.map(q).join(',')];
  for (let i = 0; i < n / 2; i++) {
    fl.push(fh.map((h) => q(({
      תאריך: pick(dates), 'קוד מזהה': pick([`ID${i}`, '']), 'שם לקוח': pick(['', 'משוב']), הערות: pick(['', long, 'היה "טוב"']), קטגוריה: pick(['בקשת תנאים גמישים', '']),
      מבחן: pick(['עבר', 'לא עבר', '', 'אחר']),
    } as Record<string, string>)[h] ?? '')).join(','));
  }
  // נקודות עצירה (#38): עמודות בסדר אחר, עמודה לא מוכרת, תאריכים בלי שניות ושבורים
  const sh = ['נסרק ב:', ...STALL_COLUMNS, 'עמודה עתידית', ...STALL_OPTIONAL.filter((c) => c !== 'נסרק ב:')];
  const sl = [sh.map(q).join(',')];
  for (let i = 0; i < n; i++) {
    sl.push(sh.map((h) => q(({
      'קוד מזהה': pick([`ID${i}`, `NEW${i}`, '']), 'תאריך כניסה': pick(dates), 'נקודת עצירה': pick(['לא ענה לטמפלייט', 'נעצר בשאלון', ' לא כתב לבוט ', '']),
      'שם תהליך': pick(['תהליך ראשי', '']), פירוט: pick(['client_notification_new_lead_v1', 'מה גודל החשבון?', '', 'שורה\nשנייה, "מרכאות"']),
      'הודעות לקוח': pick(['0', '3', '', 'x']), 'פעילות אחרונה': pick(dates), 'נסרק ב:': pick(['10/11/2026 02:15', '']), 'עמודה עתידית': 'x',
    } as Record<string, string>)[h] ?? '')).join(','));
  }
  return { analysis: al.join('\r\n'), questions: ql.join('\n'), inquiries: il.join('\n'), feedback: fl.join('\r\n'), stalls: sl.join('\r\n') };
}

function viaPhp(leads: string, at: string, purchases?: string, mailings?: string, waves?: string, ids = false, extra: Partial<Record<'analysis' | 'questions' | 'inquiries' | 'feedback' | 'stalls', string>> = {}): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const write = (name: string, text: string | undefined) => {
    if (text === undefined) return '-';
    const f = join(dir, name);
    writeFileSync(f, text);
    return f;
  };
  const args = [
    write('leads.csv', leads), at, write('purchases.csv', purchases), write('mailings.csv', mailings), write('waves.csv', waves),
    write('analysis.csv', extra.analysis), write('questions.csv', extra.questions), write('inquiries.csv', extra.inquiries), write('feedback.csv', extra.feedback), write('stalls.csv', extra.stalls),
  ];
  return JSON.parse(execFileSync('php', ['scripts/php-leads.php', ...args], { encoding: 'utf8', maxBuffer: 50e6, env: { ...process.env, OSHER_IDS: ids ? '1' : '' } }));
}

describe.skipIf(!php)('PHP on the server gives exactly the same data as TypeScript', () => {
  const at = '2026-10-19T12:00:00.000Z';

  it('on large messy sheets', () => {
    const { leads, purchases } = fixture(1500);
    const ts = JSON.parse(pack(leadsFromRows(parseCsv(leads), parseCsv(purchases), new Date(at))));
    const ph = viaPhp(leads, at, purchases);
    expect(ts.leads.length).toBeGreaterThan(600);
    expect(ts.purchases.length).toBeGreaterThan(400);
    expect(ts.purchases.some((p: { fromLead: boolean }) => p.fromLead)).toBe(true);
    expect(ts.purchases.some((p: { campaign?: string }) => p.campaign)).toBe(true);
    for (const v of ['yes', 'no']) expect(ts.purchases.some((p: { bot?: string }) => p.bot === v)).toBe(true);
    expect(ts.purchases.some((p: { bot?: string }) => p.bot === undefined)).toBe(true);
    expect(ts.purchases.some((p: { coupon?: string }) => p.coupon === 'קופון אישי של הבוט')).toBe(true);
    expect(ts.leads.some((l: { firstAt?: string }) => l.firstAt)).toBe(true);
    expect(ph).toEqual(ts);
  });

  it('with the mailing tabs, and when one of them is missing or broken', () => {
    const { leads, purchases } = fixture(150);
    const { mailings, waves } = mailingFixture();
    const ts = (m: string | null, w: string | null) =>
      JSON.parse(pack(leadsFromRows(parseCsv(leads), parseCsv(purchases), new Date(at), m === null ? null : parseCsv(m), w === null ? null : parseCsv(w))));
    const full = ts(mailings, waves);
    expect(full.mailings.length).toBeGreaterThan(25);
    expect(full.mailingWaves.map((w: { kind: string }) => w.kind)).toEqual(['wave', 'others', 'total']);
    expect(viaPhp(leads, at, purchases, mailings, waves)).toEqual(full);
    expect(viaPhp(leads, at, purchases, undefined, waves)).toEqual(ts(null, waves));
    const broken = mailings.replace('תאריך רכישה', 'תאריך');
    expect(viaPhp(leads, at, purchases, broken, waves)).toEqual(ts(broken, waves));
    expect(ts(broken, waves).mailings).toBeUndefined();
  });

  it('without the optional columns, and without a purchases tab', () => {
    const { leads, purchases } = fixture(200, false);
    expect(viaPhp(leads, at, purchases)).toEqual(JSON.parse(pack(leadsFromRows(parseCsv(leads), parseCsv(purchases), new Date(at)))));
    expect(viaPhp(leads, at)).toEqual(JSON.parse(pack(leadsFromRows(parseCsv(leads), null, new Date(at)))));
  });

  it('gives the same private ids, in the same order as the public file', () => {
    const { leads, purchases } = fixture(400);
    const { mailings, waves } = mailingFixture();
    const built = buildData(parseCsv(leads), parseCsv(purchases), new Date(at), parseCsv(mailings), parseCsv(waves));
    expect(viaPhp(leads, at, purchases, mailings, waves, true)).toEqual(built.ids);
    const { file, ids } = built;
    expect(ids.leads).toHaveLength(file.leads.length);
    expect(ids.purchases).toHaveLength(file.purchases.length);
    expect(ids.mailings).toHaveLength(file.mailings!.length);
    // רכישה שמצביעה על ליד: אותו קוד מזהה
    file.purchases.forEach((p, i) => { if (p.lead !== null) expect(ids.purchases[i]).toBe(ids.leads[p.lead]); });
    expect(file.dupes.length).toBeGreaterThan(0);
    // הקובץ הציבורי בלי הקודים
    const json = pack(file);
    for (const ns of ids.leads.filter(Boolean).slice(0, 50)) expect(json).not.toContain(`"${ns}"`);
  });

  it('with the conversation insights tabs, and when one of them is missing or broken', () => {
    const { leads, purchases } = fixture(150);
    const tabs = insightsFixture(120);
    const rows = (t: Partial<typeof tabs>): InsightRows => ({
      analysis: t.analysis ? parseCsv(t.analysis) : null, questions: t.questions ? parseCsv(t.questions) : null,
      inquiries: t.inquiries ? parseCsv(t.inquiries) : null, feedback: t.feedback ? parseCsv(t.feedback) : null, stalls: t.stalls ? parseCsv(t.stalls) : null,
    });
    const built = (t: Partial<typeof tabs>) => buildData(parseCsv(leads), parseCsv(purchases), new Date(at), null, null, rows(t));
    const full = built(tabs);
    const ins = full.file.insights;
    expect(ins.analysis!.rows.length).toBe(120);
    expect(ins.analysis!.readAt).toBe(at);
    // פניות ומשובים מלפני 2/10 לא נכנסים; תאריך שלא פוענח נשאר
    expect(ins.inquiries!.rows.length).toBeLessThan(120);
    expect(ins.inquiries!.rows.some((r) => r.at === null)).toBe(true);
    expect(ins.feedback!.rows.some((r) => r.exam === 'passed') && ins.feedback!.rows.some((r) => r.exam === 'failed')).toBe(true);
    expect(ins.questions!.rows.every((r) => r.text.trim() !== '')).toBe(true);
    // נקודות עצירה: כל השורות, ליד לפי הקוד המזהה, ערכים נקיים
    expect(ins.stalls!.rows.length).toBe(120);
    expect(ins.stalls!.rows.some((r) => r.stop === 'לא כתב לבוט')).toBe(true);
    expect(ins.stalls!.rows.some((r) => r.lead !== null) && ins.stalls!.rows.some((r) => r.lead === null)).toBe(true);
    expect(full.ids.stalls!.ns).toHaveLength(120);
    // שם וטקסט רק בקובץ הפרטי, ובאורך מוגבל
    expect(full.ids.analysis!.names.some((n) => n !== '')).toBe(true);
    expect(full.ids.inquiries!.texts.some((t) => t.endsWith('…'))).toBe(true);
    expect(full.ids.questions!.some((e) => e.length === 3)).toBe(true);
    const json = pack(full.file);
    for (const t of full.ids.inquiries!.texts.filter(Boolean).slice(0, 10)) expect(json).not.toContain(t.slice(0, 30));
    expect(viaPhp(leads, at, purchases, undefined, undefined, false, tabs)).toEqual(JSON.parse(json));
    expect(viaPhp(leads, at, purchases, undefined, undefined, true, tabs)).toEqual(JSON.parse(JSON.stringify(full.ids)));
    // לשונית חסרה, או בלי עמודת חובה: רק החלק שלה null
    const broken = { ...tabs, inquiries: undefined, feedback: tabs.feedback.replace('קטגוריה', 'סוג'), stalls: tabs.stalls.replace('נקודת עצירה', 'עצירה') };
    const part = built(broken);
    expect(part.file.insights.inquiries).toBeNull();
    expect(part.file.insights.feedback).toBeNull();
    expect(part.file.insights.stalls).toBeNull();
    expect(part.file.insights.analysis).not.toBeNull();
    expect(viaPhp(leads, at, purchases, undefined, undefined, false, broken)).toEqual(JSON.parse(pack(part.file)));
    // בלי אף לשונית: אובייקט ריק, כמו בקובץ ישן
    expect(JSON.parse(pack(built({}).file)).insights).toEqual({});
    expect((viaPhp(leads, at, purchases) as { insights: unknown }).insights).toEqual({});
  });

  it('fails the same way when a needed column is missing', () => {
    const { leads, purchases } = fixture(5);
    expect(viaPhp(leads.replace('סכום ששולם', 'סכום'), at)).toEqual({ error: 'חסרות עמודות בלשונית הלידים: סכום ששולם' });
    expect(viaPhp(leads, at, purchases.replace('קוד מזהה', 'מזהה'))).toEqual({ error: 'חסרות עמודות בלשונית הרכישות: קוד מזהה' });
  });
});
