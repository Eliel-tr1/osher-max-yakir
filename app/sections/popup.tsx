'use client';

import { useMemo, useState } from 'react';
import { botSide, fromPopup, inside, POPUP_START, popupCompare, popupFunnel, timeSeries, type Bucket, type CompareRow, type PopupPerson, type Range } from '@/lib/metrics';
import { BarList, Columns, Fold, FunnelStrip, ListBlock, RateBars, Stats, fmtDay, money, nf, pct, pctOf } from '../charts';
import { useLinkNote } from '../auth';
import { BuyList, buysCount, buysSum, peopleCount, PeopleList } from '../lists';
import { BucketChips, fmtBucket } from './shared';

/**
 * הפופאפ באתר (הנחיית המנהל, 31/10, 1/11 ו-3/11/2026): מי שב-utm_campaign שלו כתוב popup_website.
 * זמן הכניסה הוא "תאריך כניסה" המוקדם ביותר שלו, וטווח התאריכים חל עליו. ההשוואה למי שלא הגיע מהפופאפ בלשונית "לצוות".
 */
export function PopupSection({ people, range, rangeKey, open, onToggle }: { people: PopupPerson[]; range: Range; rangeKey: string; open: boolean; onToggle: () => void }) {
  const [by, setBy] = useState<Bucket | null>(null);
  const [lastKey, setLastKey] = useState(rangeKey);
  if (lastKey !== rangeKey) {
    setLastKey(rangeKey);
    setBy(null);
  }
  const note = useLinkNote();
  const v = useMemo(() => {
    const popup = people.filter((x) => fromPopup(x.lead) && inside(x.entry, range));
    const b = by ?? 'day';
    const buyers = popup.filter((x) => x.after.length > 0);
    const after = buyers.flatMap((x) => x.after);
    return {
      popup, b,
      f: popupFunnel(popup),
      series: timeSeries(popup, (x) => x.entry, b, 1, () => [1]),
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

  return (
    <Fold
      id="popup" title="הפופאפ באתר" open={open} onToggle={onToggle}
      stats={[
        { label: 'נכנסו', value: nf.format(f.entered) },
        { label: 'שיחות אמיתיות', value: nf.format(f.real) },
        { label: 'קנו אחרי הכניסה', value: nf.format(f.buyers) },
      ]}
    >
      <FunnelStrip
        fromPrev
        steps={[
          { label: 'נכנסו מהפופאפ', value: f.entered, sub: 'אנשים' },
          { label: 'שלחו רק את המשפט המוכן', value: f.onlySentence, sub: 'אנשים', pctText: `${pct(f.onlySentence, f.entered)} מהנכנסים` },
          { label: 'שלחו 2 הודעות', value: f.twoMessages, sub: 'אנשים', pctText: `${pct(f.twoMessages, f.entered)} מהנכנסים` },
          { label: 'ניהלו שיחה אמיתית', value: f.real, sub: `אנשים · מכירתית ${nf.format(f.realSales)}, שירותית ${nf.format(f.realService)}`, pctText: `${pct(f.real, f.entered)} מהנכנסים` },
          { label: 'קנו אחרי הכניסה', value: f.buyers, sub: `אנשים · חדשים ${nf.format(f.newBuyers)}, חוזרים ${nf.format(f.returningBuyers)}`, prev: f.real },
          { label: 'רכישות של הבוט', value: f.botPurchases, sub: `רכישות · ${money.format(f.botPaid)}`, pctText: `${pct(f.botPurchases, f.purchases)} מ-${nf.format(f.purchases)} הרכישות` },
        ]}
      />
      <Stats items={[
        {
          label: 'סכום', value: money.format(f.paid), sub: `${nf.format(f.purchases)} רכישות`,
          info: (
            <>
              רכישה מרגע הכניסה והלאה, לפי השעה. כולל רכישות של אותו אדם תחת קוד מזהה אחר עם אותו טלפון. חוזר = קנה גם לפני הכניסה. שלבים 2 עד 4 במשפך מחלקים את הנכנסים ולא
              מוכלים זה בזה, ולכן האחוז שלהם מהנכנסים.
            </>
          ),
        },
        { label: 'עסקה ממוצעת', value: f.avgDeal === null ? '-' : money.format(f.avgDeal) },
        { label: 'של הבוט', value: `${nf.format(f.botPurchases)} רכישות`, sub: `${money.format(f.botPaid)} מהסכום`, ring: f.paid ? f.botPaid / f.paid : null },
      ]} />

      <div className="two">
        <div>
          <div className="cardhead">
            <h3>כניסות לפי {v.b === 'day' ? 'יום' : 'שבוע'}</h3>
            <BucketChips value={by} auto="day" onChange={setBy} only={['day', 'week']} />
          </div>
          <Columns
            labels={v.series.map((d) => fmtBucket(d.key, v.b))}
            values={v.series.map((d) => d.values)}
            series={[{ key: 'in', label: 'נכנסו', color: '--bot' }]}
            note={`הפופאפ התחיל בשבוע של ${fmtDay(POPUP_START)}`}
          />
        </div>
        <div>
          <h3>מהכניסה לרכישה הראשונה</h3>
          <BarList items={f.timeToBuy.map((t) => ({ name: t.name, count: t.count }))} max={4} color="--bot" />
        </div>
      </div>

      <ListBlock
        note={note}
        items={[
          { id: 'in', title: 'נכנסו מהפופאפ', count: peopleCount(v.popup), render: () => <PeopleList people={v.popup} /> },
          { id: 'sentence', title: 'שלחו רק את המשפט המוכן', count: peopleCount(v.steps.sentence), render: () => <PeopleList people={v.steps.sentence} /> },
          { id: 'two', title: 'שלחו 2 הודעות', count: peopleCount(v.steps.two), render: () => <PeopleList people={v.steps.two} /> },
          { id: 'real', title: 'ניהלו שיחה אמיתית', count: peopleCount(v.steps.real), render: () => <PeopleList people={v.steps.real} /> },
          { id: 'after', title: 'רכישות אחרי הכניסה', count: buysCount(v.after), sum: buysSum(v.after), render: () => <BuyList purchases={v.after} /> },
          { id: 'bot', title: 'רכישות של הבוט אחרי הכניסה', count: buysCount(v.bot), sum: buysSum(v.bot), render: () => <BuyList purchases={v.bot} /> },
        ]}
      />
    </Fold>
  );
}

/**
 * הפופאפ מול מי שלא הגיע ממנו (עבר ללשונית "לצוות", הנחיית המנהל 3/11/2026). הקבוצה "כל מי שלא הגיע מהפופאפ" כוללת לידים
 * שנוצרו ברגע הרכישה באתר, ולכן אחוז הרכישה שלה גבוה מאוד.
 */
export function PopupCompare({ people, range, open, onToggle }: { people: PopupPerson[]; range: Range; open: boolean; onToggle: () => void }) {
  const cmp = useMemo(() => popupCompare(people, range), [people, range]);
  if (!people.some((x) => fromPopup(x.lead))) return null;
  const groups: [string, CompareRow, string][] = [
    ['מהפופאפ', cmp.popup, '--bot'],
    ['בוט וואטסאפ בלי הפופאפ', cmp.bot, '--notbot'],
    ['כל מי שלא הגיע מהפופאפ', cmp.others, '--notbot'],
  ];
  return (
    <Fold
      id="popupcmp" title={<>הפופאפ מול מי שלא הגיע ממנו, מ-{fmtDay(cmp.from)}</>} open={open} onToggle={onToggle}
      stats={[
        { label: 'קנו מהפופאפ', value: pctOf(cmp.popup.buyRate) },
        { label: 'קנו בבוט בלי הפופאפ', value: pctOf(cmp.bot.buyRate) },
      ]}
      info={<>אנשים שנכנסו מ-{fmtDay(cmp.from)} (שבוע עליית הפופאפ, או תחילת הטווח שבחרת). שיחה אמיתית: מתוך מי שהסוכן כבר סרק.</>}
    >
      <p className="hint tight">
        &quot;כל מי שלא הגיע מהפופאפ&quot; כולל לידים שנוצרו בטבלה ברגע הרכישה באתר, ולכן אחוז הרכישה שלו גבוה מאוד. זו לא השוואה של אותו קהל.
      </p>
      <div className="two">
        <div>
          <h3 className="minor">ניהלו שיחה אמיתית</h3>
          <RateBars rows={groups.map(([name, r, c]) => ({ name, rate: r.scanned ? r.realRate : null, sub: r.scanned ? `${nf.format(r.real)} מתוך ${nf.format(r.scanned)}` : 'לא נסרקו', color: c }))} />
        </div>
        <div>
          <h3 className="minor">קנו אחרי הכניסה</h3>
          <RateBars rows={groups.map(([name, r, c]) => ({ name, rate: r.buyRate, sub: `${nf.format(r.buyers)} מתוך ${nf.format(r.people)}`, color: c }))} />
        </div>
      </div>
    </Fold>
  );
}
