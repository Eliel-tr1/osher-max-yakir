/** סיכום של קובץ נתונים, באותם חישובים כמו הדף. רק מספרים מסוכמים, בלי פרטים אישיים. */
import { readFile } from 'node:fs/promises';
import { unpack } from '../lib/leads/file';
import { countBy, matrixByMonth, productStats, purchases, removedIn, summarize } from '../lib/metrics';

async function main() {
const file = unpack(JSON.parse(await readFile(process.argv[2] ?? 'public/data/leads.json', 'utf8')));
const s = summarize(file.leads);
const ps = purchases(file.leads);
const m = matrixByMonth(ps, (p) => p.product, (p) => p.at);
const r = (x: number | null) => (x === null ? '-' : Math.round(x));
console.log([
  `שורות ${file.sheetRows}, כפילויות ${file.duplicatesRemoved}, בלי תאריך ${file.skippedRows}, לידים ${s.leads}`,
  `דרך הבוט ${s.paidBot} (${r(s.revenueBot)}), מחוץ לבוט ${s.paidOther} (${r(s.revenueOther)}), עסקה ממוצעת בוט ${r(s.avgDealBot)}, כולל ${r(s.avgDealAll)}`,
  `הסירו את עצמם ${removedIn(file.leads, { from: null, to: null })}`,
  `רכישות לפי חודש: ${m.months.map((x, i) => `${x}: ${m.monthTotals[i]}`).join(', ')}`,
  'מוצרים: ' + productStats(ps).slice(0, 8).map((p) => `${p.name} ${p.count} (ממוצע ${r(p.avg)}, ${r(p.min)}-${r(p.max)})`).join('; '),
  'מבחנים: ' + countBy(file.leads, (l) => l.test).slice(0, 5).map((t) => `${t.name} ${t.count}`).join('; '),
].join('\n'));
}

main();
