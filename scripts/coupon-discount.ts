/** אבחון: גובה ההנחה (discount בעמודה M) לפי סוג קוד. רק ספירות וערכי הנחה, בלי קודים אישיים. */
import { readFileSync } from 'node:fs';
import { parseCsv, parseSheetDate } from '../lib/sheet/parse';

const [, pp] = process.argv.slice(2);
const [h, ...rows] = parseCsv(readFileSync(pp, 'utf8'));
const idx = new Map(h.map((x, i) => [x.trim(), i]));
const c = (r: string[], n: string) => (r[idx.get(n) ?? -1] ?? '').trim();
const PTB = /^PTB-[0-9A-F]{10}$/;
const per = new Map<string, Map<string, number>>();
const amountsOf = new Map<string, number[]>();
const counts = new Map<string, number>();
const parsed: { code: string; discount: string; amount: number | null; product: string }[] = [];
for (const r of rows) {
  const t = c(r, 'קופון מהרכישה');
  if (!t.startsWith('{')) continue;
  let j: { code?: unknown; discount?: unknown };
  try { j = JSON.parse(t); } catch { continue; }
  const code = typeof j.code === 'string' ? j.code.trim().toUpperCase() : '';
  if (!code || code === 'EMPTY') continue;
  const d = j.discount === undefined || j.discount === null ? '(אין)' : String(j.discount);
  const amount = Number(c(r, 'סכום ששולם').replace(/[^\d.]/g, '')) || null;
  parsed.push({ code, discount: d, amount, product: c(r, 'מוצר שנקנה') });
  counts.set(code, (counts.get(code) ?? 0) + 1);
}
const group = (code: string) => (PTB.test(code) ? 'קוד אישי של הבוט' : (counts.get(code) ?? 0) >= 3 ? code : '(קוד נדיר)');
for (const p of parsed) {
  const g = group(p.code);
  const m = per.get(g) ?? per.set(g, new Map()).get(g)!;
  m.set(p.discount, (m.get(p.discount) ?? 0) + 1);
  if (p.amount !== null) (amountsOf.get(g) ?? amountsOf.set(g, []).get(g)!).push(p.amount);
}
const shape = [...new Set(parsed.slice(0, 30).map((p) => p.discount.replace(/[0-9]/g, '9')))].join(' | ');
const out = [`צורת הערך discount: ${shape}`];
for (const [g, m] of [...per.entries()].sort((a, b) => [...b[1].values()].reduce((s, v) => s + v, 0) - [...a[1].values()].reduce((s, v) => s + v, 0))) {
  const am = (amountsOf.get(g) ?? []).sort((a, b) => a - b);
  const med = am.length ? am[Math.floor(am.length / 2)] : null;
  out.push(`הנחה לפי קוד: ${g}: ${[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} (${v})`).join(', ')}; סכום חציוני ${med ?? '-'}`);
}
// אותו מוצר: הנחה של קוד אישי מול קודים כלליים
const byProduct = new Map<string, Map<string, Set<string>>>();
for (const p of parsed) {
  if (!p.product) continue;
  const g = group(p.code);
  const m = byProduct.get(p.product) ?? byProduct.set(p.product, new Map()).get(p.product)!;
  (m.get(g) ?? m.set(g, new Set()).get(g)!).add(p.discount);
}
const both = [...byProduct.entries()].filter(([, m]) => m.has('קוד אישי של הבוט') && m.size > 1).slice(0, 8);
for (const [prod, m] of both) out.push(`הנחה לפי מוצר: ${prod}: ${[...m.entries()].map(([g, s]) => `${g} ${[...s].join('/')}`).join(' · ')}`);
void parseSheetDate;
console.log(out.join('\n'));
