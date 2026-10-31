/** משווה את עיבוד הטבלה האמיתית ב-TypeScript וב-PHP. מדפיס רק "זהה" או כמה שדות שונים, בלי נתונים. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pack } from '../lib/leads/file';
import { leadsFromRows } from '../lib/leads/fromSheet';
import { parseCsv } from '../lib/sheet/parse';

// leads.csv [purchases.csv] [mailings.csv] [waves.csv]; קובץ שלא קיים = לשונית חסרה
const [leadsPath, ...rest] = process.argv.slice(2);
const paths = [0, 1, 2].map((i) => (rest[i] && existsSync(rest[i]) && readFileSync(rest[i], 'utf8').trim() ? rest[i] : null));
const rows = (p: string | null) => (p ? parseCsv(readFileSync(p, 'utf8')) : null);
const at = '2026-01-01T00:00:00.000Z';
const ts = JSON.parse(pack(leadsFromRows(parseCsv(readFileSync(leadsPath, 'utf8')), rows(paths[0]), new Date(at), rows(paths[1]), rows(paths[2]))));
const php = JSON.parse(execFileSync('php', ['scripts/php-leads.php', leadsPath, at, ...paths.map((p) => p ?? '-')], { encoding: 'utf8', maxBuffer: 100e6 }));
const count = (k: string) => {
  let d = 0;
  (ts[k] ?? []).forEach((x: unknown, i: number) => { if (!isDeepStrictEqual(x, php[k]?.[i])) d++; });
  return `${k}: ${d} שונים (TS ${ts[k]?.length ?? 'אין'} מול PHP ${php[k]?.length ?? 'אין'})`;
};
if (isDeepStrictEqual(ts, php)) {
  console.log(`PHP מול TypeScript על הטבלה האמיתית: זהה (${ts.leads.length} לידים, ${ts.purchases.length} רכישות, ${ts.mailings?.length ?? 'אין'} רכישות דיוור, ${ts.mailingWaves?.length ?? 'אין'} שורות סיכום)`);
} else {
  console.log(`PHP מול TypeScript על הטבלה האמיתית: שונה! ${['leads', 'purchases', 'mailings', 'mailingWaves'].map(count).join('; ')}`);
  process.exitCode = 1;
}
