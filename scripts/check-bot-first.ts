/**
 * המספרים החדשים של "הבוט קודם" (#27) ו"תובנות שיחה" (#26) על הגיליון האמיתי, באותם חישובים כמו הדף, בטווח "הכול".
 * רק ספירות, סכומים ושמות של קטגוריות, בלי פרטים אישיים (ההערות ב-Actions ציבוריות).
 *   npx tsx scripts/check-bot-first.ts leads.json
 */
import { readFileSync } from 'node:fs';
import {
  abandonView, feedbackView, inquiryView, questionView, removalView, testLeadsOf, TEST_REASON, type Scope,
} from '../lib/insights';
import { unpack } from '../lib/leads/file';
import { annotate, botHero, capabilities, inRange, mailingLevels, withPurchasesAfterEntry, type Range } from '../lib/metrics';

const file = unpack(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const all: Range = { from: null, to: null };
const e = (x: number) => `€${Math.round(x).toLocaleString('en-US')}`;
const n = (x: number) => x.toLocaleString('en-US');
const pc = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const out: string[] = [];

// ---------- "מה הבוט הביא" ----------
const h = botHero(file.purchases, null);
out.push(`מה הבוט הביא (הכול): ${e(h.paid)} · ${n(h.purchases)} רכישות · ${n(h.buyers)} לקוחות · עסקה ממוצעת ${h.avgDeal === null ? '-' : e(h.avgDeal)} · ${h.share === null ? '-' : `${Math.round(100 * h.share)}%`} מכל ההכנסות · סך ההכנסות ${e(h.totalPaid)} · עוד לא הוכרעו ${n(h.open.purchases)} (${e(h.open.paid)})`);

// ---------- "מה הבוט עושה" ----------
const leads = annotate(file);
const people = withPurchasesAfterEntry(leads, file.purchases);
const caps = capabilities({ leads: inRange(leads, all), couponLeads: leads, purchases: inRange(file.purchases, all), people, mailings: file.mailings, range: all });
const byReason = caps.sales.paid + caps.coupons.paid + caps.links.paid;
const five = byReason + caps.mail.paid + caps.popup.paid;
out.push(`כרטיסי היכולת (הכול): שיחות מכירה ${n(caps.sales.count)} · ${e(caps.sales.paid)} | קופונים ${n(caps.coupons.count)} · ${e(caps.coupons.paid)} | קישורים ${n(caps.links.count)} · ${e(caps.links.paid)} | דיוורים ${n(caps.mail.count)} · ${e(caps.mail.paid)} | פופאפ ${n(caps.popup.count)} · ${e(caps.popup.paid)}`);
out.push(`סכום ה-€: שלושת הכרטיסים לפי סיבה ${e(byReason)} ${byReason <= h.paid ? '≤' : '>'} ${e(h.paid)} של הבוט; כל החמישה ${e(five)} ${five <= h.paid ? '≤' : '>'} ${e(h.paid)}`);
const lv = mailingLevels(file.mailings ?? []);
out.push(`דיוור, שלוש רמות: דרך הקישור ${lv.link.length} · רק הקוד SPOOKY ${lv.spooky.length} · שאר הרכישות עד 72 שעות ${lv.rest.length}`);

// ---------- "תובנות שיחה" ----------
const ins = file.insights;
const a = ins.analysis?.rows ?? null;
const scope: Scope = { range: all, keep: null, testLeads: testLeadsOf(a) };
if (a) {
  const tests = a.filter((r) => r.reason === TEST_REASON).length;
  out.push(`ניתוח שיחות: ${n(a.length)} שורות · קנה כן/לא ${n(a.filter((r) => r.bought === 'yes').length)}/${n(a.filter((r) => r.bought === 'no').length)} · שיחת בדיקה ${tests} (בלי ליד בלשונית הלידים: ${a.filter((r) => r.lead === null).length})`);
  const v = abandonView(a, scope, null);
  const sum = v.reasons.reduce((s, r) => s + r.count, 0);
  out.push(`ניהלו שיחה וקנו ${n(v.bought)} · ניהלו שיחה ולא קנו ${n(v.abandoned)} · סכום הסיבות ${n(sum)} ${sum === v.abandoned ? '= הנטושים' : '≠ הנטושים!'} · שיחת בדיקה בשורות הכרטיס: ${v.rows.filter((x) => x.r.reason === TEST_REASON).length}`);
  out.push('סיבות: ' + v.reasons.map((r) => `${r.name} ${r.count} (${pc(r.count, v.abandoned)})`).join(' · '));
  out.push(`בלי שיחה: ${v.noConversation.map((x) => `${x.name} ${n(x.count)}`).join(' · ')} · בבדיקה ${v.pending}`);
  out.push('איפה נעצרו: ' + v.stops.map((s) => `${s.name} ${s.count}`).join(' · '));
  out.push(`הסירו את עצמם: ${removalView(a, scope).count}`);
} else out.push('ניתוח שיחות: הלשונית לא נקראה');
const iq = ins.inquiries?.rows ?? null;
if (iq) {
  const v = inquiryView(iq, scope);
  out.push(`פניות: ${n(iq.length)} שורות מ-2/10 · בלי תאריך מפוענח ${iq.filter((r) => r.at === null).length} · מסווגות ${n(v.categorized)} · בסיווג ${v.pending} · אנשים ${n(v.people)} · ${v.cats.map((c) => `${c.name} ${c.count}/${c.people} (${Math.round(100 * c.share)}%)`).join(' · ')}`);
} else out.push('פניות: הלשונית לא נקראה');
const fb = ins.feedback?.rows ?? null;
if (fb) {
  const v = feedbackView(fb, scope, 'all');
  out.push(`משובים: ${n(fb.length)} שורות מ-2/10 · בלי תאריך מפוענח ${fb.filter((r) => r.at === null).length} · מסווגים ${n(v.categorized)} · בסיווג ${v.pending} · ${v.cats.map((c) => `${c.name} ${c.count}`).join(' · ')}`);
  out.push(`משובים לפי מבחן: עבר ${feedbackView(fb, scope, 'passed').categorized} · לא עבר ${feedbackView(fb, scope, 'failed').categorized}`);
} else out.push('משובים: הלשונית לא נקראה');
const q = ins.questions?.rows ?? null;
if (q) {
  const v = questionView(q, all, true);
  out.push(`שאלות ליקיר: ${v.all.length} שאלות · ${n(v.all.reduce((s, x) => s + x.r.count, 0))} מופעים · פעמיים ומעלה ${v.all.filter((x) => x.r.count >= 2).length} · ממתינות ${v.waiting} · ענו ${v.answered}`);
} else out.push('שאלות ליקיר: הלשונית לא נקראה');
console.log(out.join('\n'));
