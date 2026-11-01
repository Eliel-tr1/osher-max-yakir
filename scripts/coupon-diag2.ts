/** אבחון מעמיק 2: הקוד שהלקוח הקליד (M, מהוובהוק) מול הקופון שהבוט הפיק (BJ). רק ספירות וצורות, בלי קודים אישיים. */
import { readFileSync } from 'node:fs';
import { phoneKey } from '../lib/leads/fromSheet';
import { isActivation } from '../lib/metrics';
import { parseCsv, parseSheetDate } from '../lib/sheet/parse';

const [lp, pp] = process.argv.slice(2);
const tab = (p: string) => {
  const [h, ...rows] = parseCsv(readFileSync(p, 'utf8'));
  const idx = new Map(h.map((x, i) => [x.trim(), i]));
  return { rows: rows.filter((r) => r.some((c) => c.trim())), c: (r: string[], n: string) => (r[idx.get(n) ?? -1] ?? '').trim() };
};
const L = tab(lp);
const P = tab(pp);
const out: string[] = [];
const PTB = /^PTB-[0-9A-F]{10}$/;
const FULL_FROM = Date.parse('2026-10-26T00:00:00+02:00');
const PARTIAL_FROM = Date.parse('2026-10-14T00:00:00+03:00');
const inc = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const fmt = (m: Map<string, number>, min = 1) => [...m.entries()].filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');

/** צורת התא הגולמי ב-M, והקוד שבו */
function cell(v: string): { form: string; code: string } {
  const t = v.trim();
  if (t === '') return { form: 'ריק', code: '' };
  if (t === '-') return { form: '-', code: '' };
  if (/^empty$/i.test(t)) return { form: 'empty', code: '' };
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const keys = Object.keys(j ?? {}).sort().join('|');
      const c = typeof j?.code === 'string' ? j.code.trim().toUpperCase() : '';
      return { form: `JSON(${keys})${c ? '' : ' בלי קוד'}`, code: c === 'EMPTY' || c === '-' ? '' : c };
    } catch {
      return { form: 'JSON שבור', code: '' };
    }
  }
  return { form: 'טקסט', code: t.toUpperCase() };
}

// א. איך נראה תא M, לפי תקופה
const forms = { before: new Map<string, number>(), partial: new Map<string, number>(), full: new Map<string, number>() };
const allCodes = new Map<string, number>();
for (const r of P.rows) {
  const at = parseSheetDate(P.c(r, 'תאריך'))?.getTime() ?? 0;
  const { form, code } = cell(P.c(r, 'קופון מהרכישה'));
  inc(at >= FULL_FROM ? forms.full : at >= PARTIAL_FROM ? forms.partial : forms.before, form);
  if (code) inc(allCodes, code);
}
out.push(`M לפני 14/10: ${fmt(forms.before)}`);
out.push(`M 14/10 עד 25/10: ${fmt(forms.partial)}`);
out.push(`M מ-26/10: ${fmt(forms.full)}`);

// אנשים עם קופון בוט: לפי קוד מזהה, ואותו אדם לפי טלפון
const bjOf = new Map<string, { code: string; at: number | null }>();
const nsOfPhone = new Map<string, Set<string>>();
for (const r of L.rows) {
  const ns = L.c(r, 'קוד מזהה');
  if (!ns) continue;
  const code = L.c(r, 'קופון הבוט').toUpperCase();
  if (code) bjOf.set(ns, { code, at: parseSheetDate(L.c(r, 'תאריך קופון'))?.getTime() ?? null });
  const ph = phoneKey(L.c(r, 'טלפון'));
  if (ph) (nsOfPhone.get(ph) ?? nsOfPhone.set(ph, new Set()).get(ph)!).add(ns);
}
const hexes = new Map([...bjOf.values()].map((b) => [b.code.slice(-10), b.code] as const));
const bjShapes = new Map<string, number>();
for (const b of bjOf.values()) inc(bjShapes, PTB.test(b.code) ? 'PTB-XXXXXXXXXX' : b.code.replace(/[0-9]/g, '9').replace(/[A-Z]/g, 'A'));
out.push(`צורות הקוד ב-BJ: ${fmt(bjShapes)}; עם תאריך קופון: ${[...bjOf.values()].filter((b) => b.at !== null).length} מתוך ${bjOf.size}`);

// ב-ו. רכישות של מי שקיבל קופון, אחרי הקופון
type Row = { kind: string; family: string; gapH: number; reason: string; byPhone: boolean; full: boolean; generic: string | null; amount: number | null };
const rows: Row[] = [];
let fuzzy = 0, fuzzyOther = 0;
for (const r of P.rows) {
  const ns = P.c(r, 'קוד מזהה');
  const at = parseSheetDate(P.c(r, 'תאריך'))?.getTime() ?? 0;
  const raw = P.c(r, 'קופון מהרכישה').toUpperCase();
  const { code } = cell(P.c(r, 'קופון מהרכישה'));
  // האם החלק האקראי של קוד בוט כלשהו מופיע בתא, גם בלי PTB- או עם רווחים
  const hit = [...raw.matchAll(/[0-9A-F]{10}/g)].some((m) => hexes.has(m[0]));
  if (hit) { fuzzy++; if (!PTB.test(code)) fuzzyOther++; }
  let bj = bjOf.get(ns);
  let byPhone = false;
  if (!bj) {
    const ph = phoneKey(P.c(r, 'טלפון'));
    for (const o of ph ? nsOfPhone.get(ph) ?? [] : []) if (bjOf.has(o)) { bj = bjOf.get(o); byPhone = true; }
  }
  if (!bj || bj.at === null || at < bj.at) continue;
  const amount = Number(P.c(r, 'סכום ששולם').replace(/[^\d.]/g, '')) || null;
  const product = P.c(r, 'מוצר שנקנה') || null;
  const kind = !code ? 'בלי קוד' : code === bj.code ? 'הקוד שלו' : PTB.test(code) ? 'קוד בוט של אחר' : 'קוד כללי';
  rows.push({
    kind, family: isActivation({ product, amount }) ? 'דמי הפעלה' : 'אתגר/מוצר', gapH: (at - bj.at) / 3_600_000, reason: P.c(r, 'סיבה') || '(ריק)',
    byPhone, full: at >= FULL_FROM, generic: kind === 'קוד כללי' ? ((allCodes.get(code) ?? 0) >= 3 ? code : '(קוד נדיר)') : null, amount,
  });
}
const by = (xs: Row[], f: (x: Row) => string) => { const m = new Map<string, number>(); for (const x of xs) inc(m, f(x)); return fmt(m); };
out.push(`תא M שמכיל את החלק האקראי של קוד בוט כלשהו: ${fuzzy} (מתוכם לא בצורה PTB- תקינה: ${fuzzyOther})`);
out.push(`רכישות אחרי הקופון: ${rows.length} (התאמה לפי טלפון ולא קוד מזהה: ${rows.filter((x) => x.byPhone).length}). לפי סוג: ${by(rows, (x) => x.kind)}`);
const full = rows.filter((x) => x.full);
out.push(`רק מ-26/10 (M מלא): ${full.length}. ${by(full, (x) => x.kind)}`);
out.push(`מ-26/10, לפי מוצר: אתגר/מוצר [${by(full.filter((x) => x.family !== 'דמי הפעלה'), (x) => x.kind)}]; דמי הפעלה [${by(full.filter((x) => x.family === 'דמי הפעלה'), (x) => x.kind)}]`);
const gap = (h: number) => (h < 1 ? 'עד שעה' : h < 24 ? 'עד יום' : h < 168 ? 'עד שבוע' : 'יותר משבוע');
for (const g of ['עד שעה', 'עד יום', 'עד שבוע', 'יותר משבוע']) out.push(`מ-26/10, ${g} מהקופון: ${by(full.filter((x) => gap(x.gapH) === g), (x) => x.kind)}`);
out.push(`מ-26/10, קודים כלליים: ${by(full.filter((x) => x.generic), (x) => x.generic!)}`);
out.push(`מ-26/10, הסיבה שנרשמה כשאין קוד: ${by(full.filter((x) => x.kind === 'בלי קוד'), (x) => x.reason)}`);
out.push(`מ-26/10, הסיבה שנרשמה כשיש את הקוד שלו: ${by(full.filter((x) => x.kind === 'הקוד שלו'), (x) => x.reason)}`);

// ז. קופונים שהופקו מ-26/10: כמה קנו אחר כך, ובמה
const issued = [...bjOf.entries()].filter(([, b]) => b.at !== null && b.at >= FULL_FROM);
out.push(`קופונים שהופקו מ-26/10: ${issued.length}`);
console.log(out.join('\n'));
