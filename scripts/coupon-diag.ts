/** אבחון: קופונים שהבוט הפיק (BJ) מול הקודים ברכישות (M). רק ספירות וצורות, בלי קודים אישיים. */
import { readFileSync } from 'node:fs';
import { couponCode, phoneKey } from '../lib/leads/fromSheet';
import { parseCsv, parseSheetDate } from '../lib/sheet/parse';

const [lp, pp] = process.argv.slice(2);
const tab = (p: string) => {
  const [h, ...rows] = parseCsv(readFileSync(p, 'utf8'));
  const idx = new Map(h.map((x, i) => [x.trim(), i]));
  return { h: h.map((x) => x.trim()), rows: rows.filter((r) => r.some((c) => c.trim())), c: (r: string[], n: string) => (r[idx.get(n) ?? -1] ?? '').trim() };
};
const L = tab(lp);
const P = tab(pp);
const out: string[] = [];
const shape = (v: string) => v.replace(/[0-9]/g, '9').replace(/[A-F]/g, 'X').replace(/[G-Z]/g, 'A');
const raw = (v: string) => {
  let t = v.trim();
  if (t.startsWith('{')) { try { const j = JSON.parse(t); t = typeof j?.code === 'string' ? j.code : ''; } catch { /* טקסט */ } }
  t = t.trim().toUpperCase();
  return t === '' || t === '-' || t === 'EMPTY' ? '' : t;
};

// 1. כמה רכישות עם קוד ב-M, לפי שבוע, ומאיזה תאריך יש JSON
const byWeek = new Map<string, [number, number, number]>();
let firstJson: number | null = null;
for (const r of P.rows) {
  const at = parseSheetDate(P.c(r, 'תאריך'));
  if (!at) continue;
  const m = P.c(r, 'קופון מהרכישה');
  const d = new Date(at.getTime() + 3 * 3600_000);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(5, 10);
  const w = byWeek.get(monday) ?? [0, 0, 0];
  w[0]++;
  if (m !== '') w[1]++;
  if (raw(m)) w[2]++;
  byWeek.set(monday, w);
  if (m.startsWith('{') && (firstJson === null || at.getTime() < firstJson)) firstJson = at.getTime();
}
out.push('רכישות לפי שבוע (כל הרכישות / תא M לא ריק / עם קוד): ' + [...byWeek.entries()].sort().map(([k, [a, b, c]]) => `${k}: ${a}/${b}/${c}`).join(' · '));
out.push(`JSON ראשון ב-M: ${firstJson ? new Date(firstJson).toISOString().slice(0, 10) : 'אין'}`);

// 2. צורות של הקודים ב-M (בלי הקודים)
const shapes = new Map<string, number>();
const names = new Map<string, number>();
for (const r of P.rows) {
  const c = raw(P.c(r, 'קופון מהרכישה'));
  if (!c) continue;
  shapes.set(shape(c), (shapes.get(shape(c)) ?? 0) + 1);
  names.set(c, (names.get(c) ?? 0) + 1);
}
out.push('צורות הקודים ב-M: ' + [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} (${v})`).join('; '));
out.push(`קודים שונים ב-M: ${names.size}; מופיעים פעם אחת: ${[...names.values()].filter((v) => v === 1).length}`);

// 3. BJ מול M: לפי קוד מזהה, ולפי טלפון
const bjOf = new Map<string, { code: string; at: number | null }>();
const bjCodes = new Set<string>();
for (const r of L.rows) {
  const ns = L.c(r, 'קוד מזהה');
  const code = L.c(r, 'קופון הבוט').toUpperCase();
  if (!ns || !code) continue;
  bjOf.set(ns, { code, at: parseSheetDate(L.c(r, 'תאריך קופון'))?.getTime() ?? null });
  bjCodes.add(code);
}
const nsOfPhone = new Map<string, string[]>();
for (const r of L.rows) {
  const ns = L.c(r, 'קוד מזהה');
  const ph = phoneKey(L.c(r, 'טלפון'));
  if (ns && ph) nsOfPhone.set(ph, [...new Set([...(nsOfPhone.get(ph) ?? []), ns])]);
}
let withBjBuyers = 0, withBjPurchases = 0, afterCoupon = 0, sameCode = 0, otherPtb = 0, generic = 0, none = 0, matchAnyBj = 0;
const genericNames = new Map<string, number>();
const buyersSeen = new Set<string>();
for (const r of P.rows) {
  const ns = P.c(r, 'קוד מזהה');
  const at = parseSheetDate(P.c(r, 'תאריך'))?.getTime() ?? 0;
  const m = raw(P.c(r, 'קופון מהרכישה'));
  if (m && bjCodes.has(m)) matchAnyBj++;
  let bj = bjOf.get(ns);
  if (!bj) {
    const ph = phoneKey(P.c(r, 'טלפון'));
    for (const other of ph ? nsOfPhone.get(ph) ?? [] : []) if (bjOf.has(other)) bj = bjOf.get(other);
  }
  if (!bj) continue;
  withBjPurchases++;
  if (!buyersSeen.has(bj.code)) { buyersSeen.add(bj.code); withBjBuyers++; }
  if (bj.at !== null && at >= bj.at) {
    afterCoupon++;
    if (!m) none++;
    else if (m === bj.code) sameCode++;
    else if (/^PTB-[0-9A-F]{10}$/.test(m)) otherPtb++;
    else { generic++; genericNames.set(m, (genericNames.get(m) ?? 0) + 1); }
  }
}
out.push(`אנשים עם קופון בוט (BJ): ${bjOf.size}; מתוכם קנו (לפי קוד מזהה או טלפון): ${withBjBuyers}; הרכישות שלהם: ${withBjPurchases}; מהן אחרי תאריך הקופון: ${afterCoupon}`);
out.push(`ברכישות האלה אחרי הקופון: עם הקוד שלהם ${sameCode}; עם קוד אישי אחר ${otherPtb}; עם קוד כללי ${generic} (${[...genericNames.entries()].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 3).map(([k, v]) => `${k} ${v}`).join(', ')}); בלי קוד ב-M ${none}`);
out.push(`רכישות שב-M שלהן קוד שמופיע ב-BJ של מישהו: ${matchAnyBj}`);

// 4. מי שנכשל במבחן: באיזה קוד קנו אחר כך
const failed = new Set(L.rows.filter((r) => L.c(r, 'סטטוס') === 'לא עבר').map((r) => L.c(r, 'קוד מזהה')).filter(Boolean));
const failCodes = new Map<string, number>();
let failBuys = 0, failNoCode = 0;
for (const r of P.rows) {
  if (!failed.has(P.c(r, 'קוד מזהה'))) continue;
  failBuys++;
  const m = raw(P.c(r, 'קופון מהרכישה'));
  if (!m) { failNoCode++; continue; }
  const k = /^PTB-[0-9A-F]{10}$/.test(m) ? '(קוד אישי של הבוט)' : (names.get(m) ?? 0) >= 3 ? m : `(${shape(m)})`;
  failCodes.set(k, (failCodes.get(k) ?? 0) + 1);
}
out.push(`נכשלו במבחן (לפי סטטוס): ${failed.size} אנשים; רכישות שלהם: ${failBuys}; בלי קוד ב-M: ${failNoCode}; קודים: ` + [...failCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', '));

// 5. עמודת "קופון" בלשונית הלידים
if (L.h.includes('קופון')) {
  const vals = L.rows.map((r) => raw(L.c(r, 'קופון'))).filter(Boolean);
  const sh = new Map<string, number>();
  for (const v of vals) sh.set(shape(v), (sh.get(shape(v)) ?? 0) + 1);
  out.push(`עמודת "קופון" בלידים: מלאה ב-${vals.length}; צורות: ` + [...sh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} (${v})`).join('; ') + `; זהה ל-BJ באותה שורה: ${L.rows.filter((r) => raw(L.c(r, 'קופון')) && raw(L.c(r, 'קופון')) === L.c(r, 'קופון הבוט').toUpperCase()).length}`);
}
void couponCode;
console.log(out.join('\n'));
