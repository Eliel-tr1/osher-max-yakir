/** משווה את עיבוד הטבלה האמיתית ב-TypeScript וב-PHP. מדפיס רק "זהה" או כמה שדות שונים, בלי נתונים. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pack } from '../lib/leads/file';
import { leadsFromRows } from '../lib/leads/fromSheet';
import { parseCsv } from '../lib/sheet/parse';

const csvPath = process.argv[2];
const at = '2026-01-01T00:00:00.000Z';
const ts = JSON.parse(pack(leadsFromRows(parseCsv(readFileSync(csvPath, 'utf8')), new Date(at))));
const php = JSON.parse(execFileSync('php', ['scripts/php-leads.php', csvPath, at], { encoding: 'utf8', maxBuffer: 100e6 }));
if (isDeepStrictEqual(ts, php)) {
  console.log(`PHP מול TypeScript על הטבלה האמיתית: זהה (${ts.leads.length} לידים)`);
} else {
  let diff = 0;
  ts.leads.forEach((l: Record<string, unknown>, i: number) => { if (!isDeepStrictEqual(l, php.leads?.[i])) diff++; });
  console.log(`PHP מול TypeScript על הטבלה האמיתית: שונה! ${diff} לידים שונים, TS ${ts.leads.length} מול PHP ${php.leads?.length}`);
  process.exitCode = 1;
}
