/**
 * בונה את קובץ הנתונים של הדשבורד: public/data/leads.json (או הנתיב שמועבר ב---out).
 *   npx tsx scripts/build-data.ts --demo                    נתוני הדגמה מומצאים
 *   npx tsx scripts/build-data.ts --sheet <id> [--gid 0] [--purchases-gid 282711056]
 *       [--mailings-gid 704173708] [--waves-gid 359996576]
 *       הטבלה האמיתית (קריאה בלבד). gid 0 = הלשונית "לידים", purchases-gid = הלשונית "רכישות" (החלטת המנהל, 2026-10-29),
 *       mailings-gid = "דיוורים", waves-gid = "דיוורים - סיכום" (31/10/2026; לא חובה)
 * הקריאה היא ייצוא מלא של הלשונית: כוללת גם שורות שמוסתרות בסינון בטבלה (החלטת המנהל, 2026-10-26).
 * בקובץ אין שמות, טלפונים ומיילים. אם מבנה הטבלה השתנה, הסקריפט נכשל ולא כותב כלום.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { demoLeadsFile } from '../lib/leads/demo';
import { leadsFromRows } from '../lib/leads/fromSheet';
import { pack } from '../lib/leads/file';
import type { LeadsFile } from '../lib/leads/types';
import { parseCsv } from '../lib/sheet/parse';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function fetchTab(id: string, gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`קריאת הטבלה (gid ${gid}) נכשלה: HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!type.includes('csv') && text.trimStart().startsWith('<')) {
    throw new Error('גוגל החזיר דף ולא CSV: כנראה הטבלה לא משותפת לצפייה, או שהלשונית לא קיימת');
  }
  return parseCsv(text);
}

/** לשונית שלא חובה: כשהקריאה נכשלת מחזיר null, והסקשן שלה מוסתר */
async function optionalTab(id: string, gid: string): Promise<string[][] | null> {
  try {
    return await fetchTab(id, gid);
  } catch (e) {
    console.error(`לשונית ${gid} לא נקראה (${e instanceof Error ? e.message : e}); הסקשן שלה יוסתר`);
    return null;
  }
}

async function fromSheet(id: string, gid: string, purchasesGid: string, mailingsGid: string, wavesGid: string): Promise<LeadsFile> {
  return leadsFromRows(await fetchTab(id, gid), await fetchTab(id, purchasesGid), new Date(), await optionalTab(id, mailingsGid), await optionalTab(id, wavesGid));
}

async function main() {
  const out = arg('--out') ?? 'public/data/leads.json';
  const sheet = arg('--sheet') ?? process.env.SHEET_ID;
  const gid = arg('--gid') ?? process.env.SHEET_GID ?? '0';
  const purchasesGid = arg('--purchases-gid') ?? process.env.PURCHASES_GID ?? '282711056';
  const mailingsGid = arg('--mailings-gid') ?? process.env.MAILINGS_GID ?? '704173708';
  const wavesGid = arg('--waves-gid') ?? process.env.WAVES_GID ?? '359996576';
  const file = process.argv.includes('--demo') || !sheet ? demoLeadsFile() : await fromSheet(sheet, gid, purchasesGid, mailingsGid, wavesGid);
  if (file.origin === 'sheet' && file.leads.length === 0) throw new Error('לא נמצאו לידים בטבלה: לא מעדכן, כדי לא למחוק את מה שבאוויר');
  await mkdir(dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  await writeFile(tmp, pack(file));
  await rename(tmp, out);
  console.log(`${file.origin}: ${file.sheetRows} שורות לידים -> ${file.leads.length} לידים, ${file.purchaseRows} שורות רכישות -> ${file.purchases.length} רכישות, דיוורים ${file.mailings?.length ?? 'חסר'} -> ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
