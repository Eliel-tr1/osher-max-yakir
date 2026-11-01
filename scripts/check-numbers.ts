/**
 * בדיקת המספרים מול הגיליון האמיתי, באותם חישובים כמו הדף. רק מספרים מסוכמים ושמות של קטגוריות, בלי פרטים אישיים.
 *   npx tsx scripts/check-numbers.ts leads.json
 */
import { readFileSync } from 'node:fs';
import { unpack } from '../lib/leads/file';
import {
  annotate, BOT_COUPON_GROUP, botBreakdown, campaigns, dupesIn, examsByFamily, examsByPlatform, examsBySize, funnel, inRange, mailingCampaigns, mailingView,
  POPUP, popupFunnel, summarize, trackingHealth, usedBotCoupon, withPurchasesAfterEntry, type Range,
} from '../lib/metrics';
import { rangeFor } from '../lib/ranges';

const file = unpack(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const now = new Date(file.generatedAt);
const r0 = (x: number) => Math.round(x).toLocaleString('en-US');
const out: string[] = [];
const all: Range = { from: null, to: null };
const ps = file.purchases;
const b = botBreakdown(ps);
out.push(`של הבוט: ${b.yes.purchases} · €${r0(b.yes.paid)} · ${b.yes.buyers} קונים | לא: ${b.no.purchases} · €${r0(b.no.paid)} | עוד לא: ${b.open.purchases} · €${r0(b.open.paid)} | החלק: ${Math.round(100 * b.share.purchases!)}% / ${Math.round(100 * b.share.paid!)}% | סך הכול ${b.all.purchases}, כפולות ${dupesIn(file.dupes, all)}`);

const leads = annotate(file);
for (const preset of ['all', '7d', '30d', 'month'] as const) {
  const range = rangeFor(preset, now);
  const ls = inRange(leads, range);
  const f = funnel(ls);
  const s = summarize(ls, inRange(ps, range));
  const steps = [f.leads, f.started, f.startedQ, f.finishedQ, f.bought];
  const ok = steps.every((v, i) => i === 0 || v <= steps[i - 1]);
  out.push(`משפך ${preset}: ${steps.join(' > ')} ${ok ? 'יורד' : 'לא יורד!'} | קנו באתר ${s.siteBuyers} | אחוז המרה ${s.leads ? Math.round((100 * s.leadsWhoBought) / s.leads) : 0}%`);
}
// מי שקנה בלי שיחה ובלי שאלון, מבין הלידים של הבוט
const bl = leads.filter((l) => !l.siteBuyer);
out.push(`לידים של הבוט שקנו: ${bl.filter((l) => l.purchases > 0).length}; מתוכם ענו לבוט ${bl.filter((l) => l.purchases > 0 && l.answered).length}, סיימו שאלון ${bl.filter((l) => l.purchases > 0 && (l.qStatus === 'finished' || l.qStatus === 'converted')).length}`);

const people = withPurchasesAfterEntry(leads, ps);
const pf = popupFunnel(people.filter((x) => x.lead.campaign === POPUP));
out.push(`פופאפ: נכנסו ${pf.entered}; קנו אחרי ${pf.buyers} (חדשים ${pf.newBuyers}, חוזרים ${pf.returningBuyers}) · ${pf.purchases} רכישות · €${r0(pf.paid)}; של הבוט ${pf.botPurchases} · €${r0(pf.botPaid)}`);

const byReason = ps.filter(usedBotCoupon);
const byCode = ps.filter((p) => p.coupon === BOT_COUPON_GROUP);
const onlyReason = byReason.filter((p) => p.coupon !== BOT_COUPON_GROUP);
const onlyCode = byCode.filter((p) => !usedBotCoupon(p));
out.push(`קופון הבוט: לפי סיבה ${byReason.length}, לפי קוד ${byCode.length}, שניהם ${byReason.filter((p) => p.coupon === BOT_COUPON_GROUP).length}; רק סיבה: ${onlyReason.map((p) => `[קוד ${p.coupon ?? 'בלי'}, ${p.reason}]`).join(' ')}; רק קוד: ${onlyCode.map((p) => `[סיבה ${p.reason ?? 'ריק'}, של הבוט ${p.bot ?? 'ריק'}]`).join(' ')}`);

for (const [name, rows] of [['סוג', examsByFamily(leads)], ['גודל', examsBySize(leads)], ['פלטפורמה', examsByPlatform(leads)]] as const) {
  out.push(`מבחנים לפי ${name}: ` + rows.map((x) => `${x.name} ${x.passed}/${x.failed}/${x.total}`).join('; '));
}

const camp = campaigns(ps);
out.push('קמפיינים (P בלבד): ' + camp.slice(0, 8).map((c) => `${c.name} ${c.count}`).join(' · '));
if (file.mailingWaves && file.mailings) {
  for (const name of mailingCampaigns(file.mailingWaves, file.mailings)) {
    const v = mailingView(name, file.mailingWaves, file.mailings);
    out.push(`${name}: כרטיס ${v.total.purchases} רכישות, דרך הקישור ${v.total.viaLinkPurchases} רכישות (${v.linkBuyers} אנשים); בקמפיינים מובילים ${camp.find((c) => c.name === name)?.count ?? 0}`);
  }
}
const h = trackingHealth(file.leads, now);
out.push(`קמפיין שלא מולא: ${h.total} אנשים, ב-7 ימים ${h.last7} (${h.platforms.join(', ') || 'אין'}); ` + h.byValue.map((v) => `${v.name} ${v.count}/${v.last7}`).join(' · '));
console.log(out.join('\n'));
