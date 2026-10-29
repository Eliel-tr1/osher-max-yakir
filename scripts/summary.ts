/** סיכום של קובץ נתונים, באותם חישובים כמו הדף. רק מספרים מסוכמים, בלי פרטים אישיים. */
import { readFile } from 'node:fs/promises';
import { unpack } from '../lib/leads/file';
import { annotate, examSummary, examsByFamily, productFamily, productStats, purchaseSources, purchaseSummary, removedIn, sourceRows, summarize, timeSeries, byBot } from '../lib/metrics';

async function main() {
  const file = unpack(JSON.parse(await readFile(process.argv[2] ?? 'public/data/leads.json', 'utf8')));
  const leads = annotate(file);
  const s = summarize(leads, file.purchases);
  const b = purchaseSummary(file.purchases);
  const ex = examSummary(leads);
  const r = (x: number | null) => (x === null ? '-' : Math.round(x));
  const months = timeSeries(file.purchases, (p) => p.at, 'month', 2, (p) => (byBot(p) ? [1, 0] : [0, 1]));
  console.log([
    `שורות לידים ${file.sheetRows} -> לידים ${s.leads}; שורות רכישות ${file.purchaseRows} -> רכישות ${b.purchases} (${b.noAmount} בלי סכום)`,
    `התחילו שיחה ${s.startedJourney}, נסרקו ${s.aiAnalyzed}, שיחה אמיתית ${s.realConversations}, מכירתית ${s.salesConversations}, הסירו את עצמם ${removedIn(file.leads, { from: null, to: null })}`,
    `קונים ${b.buyers} (חוזרים ${b.repeatBuyers}), שולם ${r(b.totalPaid)}, עסקה ממוצעת ${r(b.avgDeal)}, אחוז המרה ${s.leads ? Math.round((100 * s.leadsWhoBought) / s.leads) : 0}%`,
    `בזכות הבוט ("של הבוט" = כן) ${b.bot.purchases} (${r(b.bot.paid)}), לא ${b.other.purchases} (${r(b.other.paid)}), מתוכן עוד לא הוכרעו ${b.undecided.purchases} (${r(b.undecided.paid)})`,
    `מבחנים: עשו ${ex.did}, עברו ${ex.passed}, נכשלו ${ex.failed}, נדרסו ${ex.overwritten}, עברו ורכשו ${ex.passedAndBought}; ` + examsByFamily(leads).slice(0, 5).map((x) => `${x.name} ${x.passed}/${x.passed + x.failed}`).join('; '),
    `רכישות לפי חודש (בוט/לא): ${months.map((m) => `${m.key}: ${m.values[0]}/${m.values[1]}`).join(', ')}`,
    'סוגי מוצרים: ' + productStats(file.purchases, (p) => productFamily(p.product)).slice(0, 8).map((p) => `${p.name} ${p.count} (${r(p.revenue)})`).join('; '),
    'מקור הרכישה: ' + purchaseSources(file.purchases).slice(0, 6).map((p) => `${p.name} ${p.count}`).join('; '),
    'מקור הגעה: ' + sourceRows(leads).slice(0, 6).map((x) => `${x.name} ${x.leads} (רכשו ${x.bought})`).join('; '),
  ].join('\n'));
}

main();
