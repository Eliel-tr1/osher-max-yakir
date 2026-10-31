'use client';

import { useMemo, useState } from 'react';
import type { Lead } from '@/lib/leads/types';
import {
  botSide, buyItems, fromPopup, inside, normalizeMode, popupCompare, popupFunnel, POPUP, timeSeries, type Bucket, type CompareRow, type PopupPerson, type Range,
} from '@/lib/metrics';
import { BarList, Columns, FunnelStrip, LazyFold, SimpleTable, Stats, fmtDate, money, nf, pct, pctOf } from '../charts';
import { BuyList, listMeta, PeopleList, type PersonItem } from '../lists';
import { BucketChips, fmtBucket } from './shared';

function conversation(l: Lead): string {
  if (l.aiConversation === 'yes') return normalizeMode(l.mode) ?? 'כן';
  if (l.aiConversation === 'no') return 'לא';
  return 'עוד לא נסרק';
}

function person(x: PopupPerson): PersonItem {
  return { entry: x.entry, messages: x.lead.messages, conversation: conversation(x.lead), purchases: x.after.length, paid: x.after.reduce((s, p) => s + (p.amount && p.amount > 0 ? p.amount : 0), 0) };
}

function peopleMeta(xs: PopupPerson[]): string {
  return `${nf.format(xs.length)} אנשים`;
}

/**
 * הפופאפ באתר (הנחיית המנהל, 31/10/2026): מי שאחת משורות הליד שלו היא utm_campaign = popup_website.
 * זמן הכניסה הוא "תאריך כניסה" המוקדם ביותר שלו, וטווח התאריכים חל עליו.
 */
export function PopupSection({ people, leads, range, rangeKey }: { people: PopupPerson[]; leads: Lead[]; range: Range; rangeKey: string }) {
  const [by, setBy] = useState<Bucket | null>(null);
  const [lastKey, setLastKey] = useState(rangeKey);
  if (lastKey !== rangeKey) {
    setLastKey(rangeKey);
    setBy(null);
  }
  const v = useMemo(() => {
    const popup = people.filter((x) => fromPopup(x.lead) && inside(x.entry, range));
    const b = by ?? 'day';
    const buyers = popup.filter((x) => x.after.length > 0);
    const after = buyers.flatMap((x) => x.after);
    return {
      popup, b,
      f: popupFunnel(popup),
      series: timeSeries(popup, (x) => x.entry, b, 1, () => [1]),
      cmp: popupCompare(people, range),
      steps: {
        sentence: popup.filter((x) => x.lead.messages === 1),
        two: popup.filter((x) => x.lead.messages === 2),
        real: popup.filter((x) => x.lead.aiConversation === 'yes'),
        buyers,
      },
      after,
      bot: after.filter((p) => botSide(p) === 'yes'),
    };
  }, [people, range, by]);
  const { f } = v;
  if (!people.some((x) => fromPopup(x.lead))) return null;

  const cmpRow = (name: string, r: CompareRow) => ({
    key: name,
    cells: [name, nf.format(r.people), r.scanned ? `${pctOf(r.realRate)} (${nf.format(r.real)} מתוך ${nf.format(r.scanned)} שנסרקו)` : '-', `${pctOf(r.buyRate)} (${nf.format(r.buyers)})`],
  });

  return (
    <section className="card" aria-labelledby="popup-h">
      <div className="cardhead">
        <h2 id="popup-h">הפופאפ באתר</h2>
      </div>
      <FunnelStrip
        fromPrev
        steps={[
          { label: 'נכנסו מהפופאפ', value: f.entered },
          { label: 'שלחו רק את המשפט המוכן', value: f.onlySentence, pctText: `${pct(f.onlySentence, f.entered)} מהנכנסים` },
          { label: 'שלחו 2 הודעות', value: f.twoMessages, pctText: `${pct(f.twoMessages, f.entered)} מהנכנסים` },
          { label: 'ניהלו שיחה אמיתית', value: f.real, sub: `מכירתית ${nf.format(f.realSales)} · שירותית ${nf.format(f.realService)}`, pctText: `${pct(f.real, f.entered)} מהנכנסים` },
          { label: 'קנו אחרי הכניסה', value: f.buyers, sub: `חדשים ${nf.format(f.newBuyers)} · חוזרים ${nf.format(f.returningBuyers)}`, prev: f.real },
          { label: 'רכישות של הבוט', value: f.botPurchases, sub: `${money.format(f.botPaid)} · מתוך ${nf.format(f.purchases)} רכישות`, pctText: `${pct(f.botPurchases, f.purchases)} מהרכישות של שלב 5` },
        ]}
      />
      <p className="hint tight">
        שלבים 2 עד 4 מחלקים את הנכנסים לפי כמה כתבו לבוט, ולא מוכלים זה בזה, ולכן האחוז שלהם הוא מהנכנסים. &quot;קנו אחרי הכניסה&quot; מול &quot;שיחה אמיתית&quot; הוא יחס, לא המרה: יש קונים בלי שיחה.
      </p>
      <Stats items={[
        { label: 'רכישות אחרי הכניסה', value: nf.format(f.purchases), sub: `${nf.format(f.buyers)} קונים` },
        { label: 'סכום', value: money.format(f.paid) },
        { label: 'עסקה ממוצעת', value: f.avgDeal === null ? '-' : money.format(f.avgDeal) },
        { label: 'של הבוט', value: nf.format(f.botPurchases), sub: `${money.format(f.botPaid)} · ${pct(f.botPaid, f.paid)} מהסכום` },
      ]} />

      <div className="two">
        <div>
          <div className="cardhead">
            <h3>כניסות לפי {v.b === 'day' ? 'יום' : v.b === 'week' ? 'שבוע' : 'חודש'}</h3>
            <BucketChips value={by} auto="day" onChange={setBy} only={['day', 'week']} />
          </div>
          <Columns labels={v.series.map((d) => fmtBucket(d.key, v.b))} values={v.series.map((d) => d.values)} series={[{ key: 'in', label: 'נכנסו', color: '--series-1' }]} />
          <p className="hint tight">הפופאפ התחיל בשבוע של 19/10. שבוע מתחיל ביום ראשון, כמו בשאר הדשבורד.</p>
        </div>
        <div>
          <h3>מהכניסה לרכישה הראשונה</h3>
          <BarList items={f.timeToBuy.map((t) => ({ name: t.name, count: t.count }))} max={4} />
        </div>
      </div>

      <h3>מול מי שלא הגיע מהפופאפ</h3>
      <SimpleTable
        headers={['', 'אנשים', 'שיחה אמיתית', 'קנו אחרי הכניסה']}
        rows={[cmpRow('מהפופאפ', v.cmp.popup), cmpRow('בוט וואטסאפ בלי הפופאפ', v.cmp.bot), cmpRow('כל מי שלא הגיע מהפופאפ', v.cmp.others)]}
      />
      <p className="hint tight">
        מי שנכנס מ-{fmtDate(`${v.cmp.from}T12:00:00Z`)} (שבוע עליית הפופאפ, או תחילת הטווח שבחרת). שיחה אמיתית: מתוך מי שהסוכן כבר סרק.
        &quot;כל מי שלא הגיע מהפופאפ&quot; כולל גם מי שנכנס לטבלה כשקנה באתר, ולכן אחוז הרכישה שלו גבוה.
      </p>

      <div className="box lists">
        <h3>רשימות</h3>
        <LazyFold title="נכנסו מהפופאפ" meta={peopleMeta(v.popup)}>{() => <PeopleList items={v.popup.map(person)} />}</LazyFold>
        <LazyFold title="שלחו רק את המשפט המוכן" meta={peopleMeta(v.steps.sentence)}>{() => <PeopleList items={v.steps.sentence.map(person)} />}</LazyFold>
        <LazyFold title="שלחו 2 הודעות" meta={peopleMeta(v.steps.two)}>{() => <PeopleList items={v.steps.two.map(person)} />}</LazyFold>
        <LazyFold title="ניהלו שיחה אמיתית" meta={peopleMeta(v.steps.real)}>{() => <PeopleList items={v.steps.real.map(person)} />}</LazyFold>
        <LazyFold title="רכישות אחרי הכניסה" meta={listMeta(v.after)}>{() => <BuyList items={buyItems(v.after, leads)} />}</LazyFold>
        <LazyFold title="רכישות של הבוט אחרי הכניסה" meta={listMeta(v.bot)}>{() => <BuyList items={buyItems(v.bot, leads)} />}</LazyFold>
      </div>
      <p className="hint">
        נכנסו מהפופאפ: ב-<bdi>utm_campaign</bdi> של האדם כתוב <bdi>{POPUP}</bdi>. זמן הכניסה הוא תאריך הכניסה המוקדם ביותר שלו. &quot;קנו אחרי הכניסה&quot;: רכישה ביום הכניסה או אחריו; קונה חוזר קנה גם לפני.
      </p>
    </section>
  );
}
