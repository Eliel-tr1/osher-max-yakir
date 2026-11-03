/** משווה את עיבוד הטבלה האמיתית ב-TypeScript וב-PHP. מדפיס רק "זהה" או כמה שדות שונים, בלי נתונים. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pack } from '../lib/leads/file';
import { buildData } from '../lib/leads/fromSheet';
import { parseCsv } from '../lib/sheet/parse';

// leads.csv [purchases.csv] [mailings.csv] [waves.csv] [analysis.csv] [questions.csv] [inquiries.csv] [feedback.csv]
// קובץ שלא קיים או ריק = לשונית חסרה
const [leadsPath, ...rest] = process.argv.slice(2);
const paths = [0, 1, 2, 3, 4, 5, 6].map((i) => (rest[i] && existsSync(rest[i]) && readFileSync(rest[i], 'utf8').trim() ? rest[i] : null));
const rows = (p: string | null) => (p ? parseCsv(readFileSync(p, 'utf8')) : null);
const at = '2026-01-01T00:00:00.000Z';
const extra = { analysis: rows(paths[3]), questions: rows(paths[4]), inquiries: rows(paths[5]), feedback: rows(paths[6]) };
const built = buildData(parseCsv(readFileSync(leadsPath, 'utf8')), rows(paths[0]), new Date(at), rows(paths[1]), rows(paths[2]), extra);
const ts = JSON.parse(pack(built.file));
const run = (ids: boolean) => JSON.parse(execFileSync('php', ['scripts/php-leads.php', leadsPath, at, ...paths.map((p) => p ?? '-')], {
  encoding: 'utf8', maxBuffer: 200e6, env: { ...process.env, OSHER_IDS: ids ? '1' : '' },
}));
const php = run(false);
const count = (a: Record<string, unknown[] | undefined>, b: Record<string, unknown[] | undefined>, k: string) => {
  let d = 0;
  (a[k] ?? []).forEach((x, i) => { if (!isDeepStrictEqual(x, b[k]?.[i])) d++; });
  return `${k}: ${d} שונים (TS ${a[k]?.length ?? 'אין'} מול PHP ${b[k]?.length ?? 'אין'})`;
};
const parts = (f: { insights?: Record<string, { rows: unknown[] } | null> }) =>
  Object.entries(f.insights ?? {}).map(([k, v]) => `${k} ${v ? v.rows.length : 'אין'}`).join(', ');
if (isDeepStrictEqual(ts, php)) {
  console.log(`PHP מול TypeScript על הטבלה האמיתית: זהה (${ts.leads.length} לידים, ${ts.purchases.length} רכישות, ${ts.mailings?.length ?? 'אין'} רכישות דיוור, ${ts.mailingWaves?.length ?? 'אין'} שורות סיכום; תובנות: ${parts(ts)})`);
} else {
  const ins = ['analysis', 'questions', 'inquiries', 'feedback'].map((k) => count(
    { [k]: ts.insights?.[k]?.rows }, { [k]: php.insights?.[k]?.rows }, k,
  ));
  console.log(`PHP מול TypeScript על הטבלה האמיתית: שונה! ${['leads', 'purchases', 'mailings', 'mailingWaves'].map((k) => count(ts, php, k)).join('; ')}; ${ins.join('; ')}`);
  process.exitCode = 1;
}
// הקובץ הפרטי: רק אם זהה, בלי להדפיס אף ערך
const phpIds = run(true);
const tsIds = JSON.parse(JSON.stringify(built.ids));
console.log(`הקובץ הפרטי, PHP מול TypeScript: ${isDeepStrictEqual(tsIds, phpIds) ? 'זהה' : `שונה! מפתחות ${Object.keys(tsIds).filter((k) => !isDeepStrictEqual(tsIds[k], phpIds[k])).join(', ')}`}`);
