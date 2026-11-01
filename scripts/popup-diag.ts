/** אבחון: מתי "נכנס מהפופאפ", ומי קנה לפני. ספירות בלבד. npx tsx scripts/popup-diag.ts leads.csv purchases.csv */
import { readFileSync } from 'node:fs';
import { parseCsv, parseSheetDate } from '../lib/sheet/parse';

const [lp, pp] = process.argv.slice(2);
const tab = (p: string) => {
  const [h, ...rows] = parseCsv(readFileSync(p, 'utf8'));
  const idx = new Map(h.map((x, i) => [x.trim(), i]));
  return { rows: rows.filter((r) => r.some((c) => c.trim())), c: (r: string[], n: string) => (r[idx.get(n) ?? -1] ?? '').trim() };
};
const L = tab(lp);
const P = tab(pp);
const start = new Date('2026-09-01T00:00:00+03:00').getTime();
const popupStart = new Date('2026-10-19T00:00:00+03:00').getTime();
const rowsOf = new Map<string, { at: number; bh: string }[]>();
for (const r of L.rows) {
  const at = parseSheetDate(L.c(r, 'תאריך כניסה'))?.getTime();
  const ns = L.c(r, 'קוד מזהה');
  if (!at || at < start || !ns) continue;
  const g = rowsOf.get(ns) ?? [];
  g.push({ at, bh: L.c(r, 'utm_campaign') });
  rowsOf.set(ns, g);
}
const buys = new Map<string, number[]>();
for (const r of P.rows) {
  const at = parseSheetDate(P.c(r, 'תאריך'))?.getTime();
  const ns = P.c(r, 'קוד מזהה');
  if (!at || at < start || !ns) continue;
  const g = buys.get(ns) ?? [];
  g.push(at);
  buys.set(ns, g);
}
const popup = [...rowsOf.entries()].filter(([, g]) => g.some((x) => x.bh === 'popup_website'));
const allRows = popup.filter(([, g]) => g.every((x) => x.bh === 'popup_website')).length;
const multi = popup.filter(([, g]) => g.length > 1).length;
const defs: Record<string, (g: { at: number; bh: string }[]) => number> = {
  'המוקדמת': (g) => Math.min(...g.map((x) => x.at)),
  'המוקדמת עם BH פופאפ': (g) => Math.min(...g.filter((x) => x.bh === 'popup_website').map((x) => x.at)),
  'המוקדמת מ-19/10 (אחרת המוקדמת)': (g) => { const a = g.filter((x) => x.at >= popupStart).map((x) => x.at); return a.length ? Math.min(...a) : Math.min(...g.map((x) => x.at)); },
  'האחרונה': (g) => Math.max(...g.map((x) => x.at)),
};
const out = [`פופאפ: ${popup.length} אנשים; BH פופאפ בכל השורות: ${allRows}; עם כמה שורות: ${multi}`];
for (const [name, f] of Object.entries(defs)) {
  let after = 0, before = 0, both = 0, beforeDay = 0;
  for (const [ns, g] of popup) {
    const e = f(g);
    const b = buys.get(ns) ?? [];
    const a = b.some((t) => t >= e);
    const bf = b.some((t) => t < e);
    if (a) after++;
    if (bf) before++;
    if (a && bf) both++;
    if (a && b.some((t) => t < e - 10 * 60_000)) beforeDay++;
  }
  out.push(`כניסה = ${name}: קנו אחרי ${after}; קנו לפני ${before}; גם וגם ${both}; קנו אחרי וגם יותר מ-10 דקות לפני ${beforeDay}`);
}
// אותו אדם עם קוד מזהה אחר: לפי טלפון (9 הספרות האחרונות). רק ספירות
const tail = (v: string) => v.replace(/\D/g, '').slice(-9);
const phoneOfNs = new Map<string, string>();
for (const r of L.rows) {
  const ns = L.c(r, 'קוד מזהה');
  const ph = tail(L.c(r, 'טלפון'));
  if (ns && ph.length === 9) phoneOfNs.set(ns, ph);
}
const buysByPhone = new Map<string, { at: number; ns: string }[]>();
for (const r of P.rows) {
  const at = parseSheetDate(P.c(r, 'תאריך'))?.getTime();
  const ph = tail(P.c(r, 'טלפון'));
  if (!at || at < start || ph.length !== 9) continue;
  const g = buysByPhone.get(ph) ?? [];
  g.push({ at, ns: P.c(r, 'קוד מזהה') });
  buysByPhone.set(ph, g);
}
let byPhoneBefore = 0, byPhoneBoth = 0, otherNs = 0;
for (const [ns, g] of popup) {
  const e = Math.min(...g.map((x) => x.at));
  const ph = phoneOfNs.get(ns);
  if (!ph) continue;
  const b = buysByPhone.get(ph) ?? [];
  const before = b.some((x) => x.at < e);
  const after = b.some((x) => x.at >= e);
  if (before) byPhoneBefore++;
  if (before && after) byPhoneBoth++;
  if (b.some((x) => x.ns !== ns)) otherNs++;
}
out.push(`לפי טלפון: קנו לפני הכניסה ${byPhoneBefore}; קנו לפני וגם אחרי ${byPhoneBoth}; עם רכישה תחת קוד מזהה אחר ${otherNs}`);
console.log(out.join('\n'));
