/**
 * המספרים של סעיף 7 בהנחיה של 31/10/2026, מחושבים באותם חישובים כמו הדף, כדי להשוות.
 * רק מספרים מסוכמים ושמות של קטגוריות, בלי פרטים אישיים.
 *   npx tsx scripts/check-numbers.ts leads.json leads.csv purchases.csv
 */
import { readFileSync } from 'node:fs';
import { unpack } from '../lib/leads/file';
import { leadsFromRows, PURCHASE_DUPLICATE_SECONDS, START_DAY, TEST_PRODUCT } from '../lib/leads/fromSheet';
import { cleanText, israelDayStart, parseCsv, parseSheetDate } from '../lib/sheet/parse';
import {
  annotate, botBreakdown, botCoupons, byReason, campaigns, couponRows, dayKey, mailingCampaigns, mailingView, popupCompare, popupFunnel, POPUP, trackingHealth,
  withPurchasesAfterEntry, timeSeries, entryOf, campaignOf,
} from '../lib/metrics';

const [jsonPath, leadsCsv, purchasesCsv] = process.argv.slice(2);
const file = unpack(JSON.parse(readFileSync(jsonPath, 'utf8')));
const all = { from: null, to: null };
const r2 = (x: number | null) => (x === null ? '-' : (Math.round(x * 100) / 100).toLocaleString('en-US'));
const out: string[] = [];
const ps = file.purchases;
const b = botBreakdown(ps);
const row = (name: string, x: { purchases: number; paid: number; buyers: number }) => `${name}: ${x.purchases} · ${r2(x.paid)} € · ${x.buyers} קונים`;
out.push(row('כל הרכישות', b.all), row('של הבוט = כן', b.yes), row('של הבוט = לא', b.no), row('של הבוט ריק', b.open));
const fromLead = ps.filter((p) => p.fromLead);
out.push(`מתוכן משורות ליד (אין להן שורה בלשונית הרכישות): ${fromLead.length} · ${r2(fromLead.reduce((s, p) => s + (p.amount ?? 0), 0))} €`);
const tab = ps.filter((p) => !p.fromLead);
out.push(row('בלי שורות הליד', botBreakdown(tab).all));
out.push('לפי סיבה: ' + byReason(ps).map((x) => `${x.name} ${x.purchases} · ${r2(x.paid)}`).join('; '));

// לשונית הרכישות: מה נשאר בחוץ ולמה
if (purchasesCsv) {
  const rows = leadsFromRows(parseCsvFile(leadsCsv), parseCsvFile(purchasesCsv)).purchaseRows;
  const data = parseCsvFile(purchasesCsv);
  const h = data[0].map((x) => x.trim());
  const c = (r: string[], n: string) => (r[h.indexOf(n)] ?? '').trim();
  const body = data.slice(1).filter((r) => r.some((x) => x.trim()));
  const start = israelDayStart(START_DAY).getTime();
  let early = 0, bad = 0, test = 0, kept = 0;
  const amounts: number[] = [];
  for (const r of body) {
    const at = parseSheetDate(c(r, 'תאריך'));
    if (!at) { bad++; continue; }
    if (at.getTime() < start) { early++; continue; }
    const p = cleanText(c(r, 'מוצר שנקנה'));
    if (p && TEST_PRODUCT.test(p)) { test++; continue; }
    kept++;
    amounts.push(Number(c(r, 'סכום ששולם').replace(/[^\d.]/g, '')) || 0);
  }
  out.push(`לשונית הרכישות: ${rows} שורות; לפני 1/9 ${early}; תאריך לא תקין ${bad}; הזמנות בדיקה ${test}; נשארו ${kept} (סכום ${r2(amounts.reduce((a, x) => a + x, 0))}); כפילויות של עד ${PURCHASE_DUPLICATE_SECONDS} שניות שהוסרו: ${kept - tab.length}`);
}

const leads = annotate(file);
const people = withPurchasesAfterEntry(leads, ps);
const popup = people.filter((x) => x.lead.campaign === POPUP);
const f = popupFunnel(popup);
out.push(`פופאפ: נכנסו ${f.entered}; רק המשפט ${f.onlySentence}; 2 הודעות ${f.twoMessages}; שיחה אמיתית ${f.real} (מכירתית ${f.realSales}, שירותית ${f.realService}); קנו אחרי הכניסה ${f.buyers} קונים (חדשים ${f.newBuyers}, חוזרים ${f.returningBuyers}) · ${f.purchases} רכישות · ${r2(f.paid)} €; של הבוט ${f.botPurchases} · ${r2(f.botPaid)} €`);
out.push('פופאפ, זמן עד רכישה: ' + f.timeToBuy.map((t) => `${t.name} ${t.count}`).join('; '));
const weeksSun = timeSeries(popup, (x) => x.entry, 'week', 1, () => [1]);
out.push('פופאפ לפי שבוע (מיום ראשון): ' + weeksSun.map((w) => `${w.key.slice(8)}/${w.key.slice(5, 7)}: ${w.values[0]}`).join(' · '));
const mon = new Map<string, number>();
for (const x of popup) {
  const d = dayKey(entryOf(x.lead));
  const dt = new Date(`${d}T12:00:00Z`);
  const m = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  mon.set(m, (mon.get(m) ?? 0) + 1);
}
out.push('פופאפ לפי שבוע (מיום שני): ' + [...mon.entries()].sort().map(([k, v]) => `${k.slice(8)}/${k.slice(5, 7)}: ${v}`).join(' · '));
const cmp = popupCompare(people, all);
out.push(`השוואה מ-${cmp.from}: פופאפ ${cmp.popup.people} אנשים, שיחה ${cmp.popup.real}/${cmp.popup.scanned}, קנו ${cmp.popup.buyers}; אחרים ${cmp.others.people}, שיחה ${cmp.others.real}/${cmp.others.scanned}, קנו ${cmp.others.buyers}`);

const bc = botCoupons(file.leads, ps, all);
out.push(`קופון הבוט: אנשים עם BJ ${file.leads.filter((l) => l.botCoupon).length} (בלי תאריך ${bc.undated}); שימושים ${bc.used} · ${r2(bc.usedPaid)} €`);
out.push('קודים מובילים: ' + couponRows(ps).slice(0, 12).map((c) => `${c.name} ${c.purchases} (בוט ${c.bot})`).join(' · '));
out.push(`רכישות בלי קופון: ${ps.filter((p) => !p.coupon).length}`);

if (file.mailingWaves && file.mailings) {
  for (const name of mailingCampaigns(file.mailingWaves, file.mailings)) {
    const v = mailingView(name, file.mailingWaves, file.mailings);
    const t = v.total;
    out.push(`${name}: ${t.sent} נשלחו · ${t.undelivered} לא נמסרו · ${t.delivered} נמסרו · ${t.buyers} קונים · ${t.purchases} רכישות · ${r2(t.amount)} €; דרך הקישור ${t.viaLinkPurchases} · ${r2(t.viaLinkAmount)} € (${v.linkBuyers} קונים); של הבוט ${t.bot}; גלים ${v.waves.length}; רכישות נמענים ברשימה ${v.recipients.length}, לא נמענים ${v.nonRecipients.length}; קופונים SPOOKY ${v.coupons.spooky} אחר ${v.coupons.other} בלי ${v.coupons.none}`);
  }
} else out.push(`דיוורים: ${file.mailings ? 'יש' : 'חסר'}, סיכום: ${file.mailingWaves ? 'יש' : 'חסר'}`);

const h = trackingHealth(file.leads, new Date());
out.push(`קמפיין שלא מולא: ${h.total} אנשים, ב-7 ימים ${h.last7}; ` + h.byValue.map((v) => `${v.name} ${v.count} (7 ימים ${v.last7})`).join(' · '));
out.push(`רכישות עם P מלא: ${ps.filter((p) => p.campaign).length}; עם קמפיין (P או BH): ${ps.filter((p) => campaignOf(p, file.leads)).length}`);
out.push('קמפיינים מובילים: ' + campaigns(ps, file.leads).slice(0, 8).map((c) => `${c.name} ${c.count} · ${r2(c.revenue)}`).join(' · '));
console.log(out.join('\n'));

function parseCsvFile(path: string): string[][] {
  return parseCsv(readFileSync(path, 'utf8'));
}
