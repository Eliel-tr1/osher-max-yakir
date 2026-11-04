'use client';

import type { ReactNode } from 'react';
import type { Purchase } from '@/lib/leads/types';
import {
  ACTIVATION_AMOUNTS, MAILING_WINDOW_HOURS, POPUP, purchaseSources, SITE_BUY_MINUTES, TRACKING_BANNER_MIN,
  type Bucket, type ExamSummary, type Funnel, type Matrix, type PassFailRow, type SourceRow, type Summary,
} from '@/lib/metrics';
import { INSIGHTS_FROM } from '@/lib/insights';
import { BarList, Columns, fmtDay, Fold, FunnelStrip, HeatTable, Info, ListBlock, money, nf, pct, pctOf, Ring, SimpleTable, Sparkline, SplitList, Stats } from '../charts';
import { BucketChips, fmtBucket } from './shared';

/**
 * לשונית "לצוות" (הנחיית המנהל 3/11/2026, #27): כל מה שלא קשור ישירות לכסף שהבוט מביא. מבחנים, מקור הגעה, תקינות קמפיינים,
 * המשפך המלא, "קנו באתר בלי לעבור בבוט", הכפולות, "הסירו את עצמם" ו"איך נספר".
 */

const BUCKET_WORD: Record<Bucket, string> = { day: 'יום', week: 'שבוע', month: 'חודש' };

function Tile({ label, value, sub, info, ring }: { label: string; value: string; sub?: string; info?: ReactNode; ring?: number | null }) {
  return (
    <article className={`tile${ring !== undefined ? ' has-ring' : ''}`}>
      <div>
        <p className="label">{label}{info ? <Info>{info}</Info> : null}</p>
        <p className="value">{value}</p>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {ring !== undefined && <Ring value={ring} size={60} label={label} />}
    </article>
  );
}

/** המספרים שהיו בראש הדף עד 3/11, עכשיו לצוות */
export function TeamTiles({ s, removed, dupes, leadsSeries, leadsBy, autoBucket, setLeadsBy, open, onToggle }: {
  s: Summary;
  removed: number;
  dupes: number;
  leadsSeries: { key: string; values: number[] }[];
  leadsBy: Bucket;
  autoBucket: Bucket;
  setLeadsBy: (b: Bucket | null) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <section className="top" aria-label="מספרי מפתח" id="team-top">
        <Tile
          label="לידים" value={nf.format(s.people)} sub={`${nf.format(s.leads)} בלי מי שקנה באתר`}
          info={`כל האנשים בטווח, לפי קוד מזהה. המשפך ואחוז ההמרה בלי ${nf.format(s.siteBuyers)} שנוצרו בלשונית הלידים עד ${SITE_BUY_MINUTES} דקות לפני הרכישה הראשונה שלהם, או אחריה.`}
        />
        <Tile label="קונים" value={nf.format(s.buyers)} sub={`${nf.format(s.purchases)} רכישות`} info="קודים מזהים שונים שקנו בטווח, לפי תאריך הרכישה בלשונית הרכישות." />
        <Tile label="שולם" value={money.format(s.totalPaid)} sub={`עסקה ממוצעת ${s.avgDeal === null ? '-' : money.format(s.avgDeal)}`} info="סכום הרכישות בטווח. עסקה ממוצעת: רק רכישות עם סכום." />
        <Tile
          label="אחוז המרה" ring={s.leads ? s.leadsWhoBought / s.leads : null} value={pct(s.leadsWhoBought, s.leads)} sub={`${nf.format(s.leadsWhoBought)} לידים רכשו`}
          info="אחוז ההמרה של הדשבורד: מתוך הלידים בטווח (בלי מי שקנה באתר בלי לעבור בבוט), כמה רכשו. זה המספר היחיד שנקרא אחוז המרה."
        />
      </section>
      <Fold
        id="t-more" title="עוד מספרים" open={open} onToggle={onToggle}
        stats={[
          { label: 'התחילו שיחה', value: nf.format(s.startedJourney) },
          { label: 'הסירו את עצמם', value: nf.format(removed) },
          { label: 'כפולות', value: nf.format(dupes) },
        ]}
      >
        <div className="top">
          <Tile
            label="התחילו שיחה" value={nf.format(s.startedJourney)} ring={s.leads ? s.startedJourney / s.leads : null} sub={`שיחה אמיתית: ${nf.format(s.realConversations)}`}
            info={`ענו לצ'אטבוט (עמודה I). שיחה אמיתית לפי הסוכן שקורא את השיחות: ${nf.format(s.realConversations)} מתוך ${nf.format(s.aiAnalyzed)} שנסרקו, מתוכן מכירתית ${nf.format(s.salesConversations)}.`}
          />
          <Tile label="קנו באתר בלי לעבור בבוט" value={nf.format(s.siteBuyers)} sub="לא במשפך" info={`ליד שנוצר עד ${SITE_BUY_MINUTES} דקות לפני הרכישה הראשונה שלו, או אחריה. לא נכנס למשפך ולאחוז ההמרה.`} />
          <Tile label="הסירו את עצמם" value={nf.format(removed)} sub="לפי תאריך ההסרה בלשונית הלידים" />
          <Tile label="רכישות כפולות" value={nf.format(dupes)} sub="לא נספרו" info="אותה רכישה שנכתבה בגיליון פעמיים: אותו קונה ואותו סכום בתוך שתי דקות. נספרת פעם אחת." />
        </div>
        <article className="tile sparkcard">
          <div className="sparkhead">
            <p className="label">לידים לפי {BUCKET_WORD[leadsBy]}</p>
            <BucketChips value={leadsBy === autoBucket ? null : leadsBy} auto={autoBucket} onChange={setLeadsBy} />
          </div>
          <Sparkline labels={leadsSeries.map((d) => fmtBucket(d.key, leadsBy))} values={leadsSeries.map((d) => d.values[0])} label="לידים לאורך זמן" />
        </article>
      </Fold>
    </>
  );
}

/** המשפך המלא מליד לרכישה. השלב האחרון הוא לא אחוז ההמרה הכללי (הנחיית המנהל 3/11/2026) */
export function FunnelCard({ funnel, siteBuyers, conversion }: { funnel: Funnel; siteBuyers: number; conversion: string }) {
  return (
    <section className="card slim" id="funnel" aria-labelledby="funnel-h">
      <h2 id="funnel-h">
        מהליד ועד הרכישה{' '}
        <Info>
          כל שלב סופר רק מי שעבר גם את השלבים שלפניו, ולכן אף שלב לא גדול מהקודם. בלי מי שקנה באתר בלי לעבור בבוט. השלב האחרון הוא מי שרכש אחרי שסיים שאלון: זה
          לא אחוז ההמרה הכללי ({conversion}), כי רוב הקונים קנו בלי שאלון.
        </Info>
      </h2>
      <FunnelStrip steps={[
        { label: 'לידים', value: funnel.leads, sub: `בלי ${nf.format(siteBuyers)} שקנו באתר` },
        { label: 'התחילו שיחה', value: funnel.started },
        { label: 'התחילו שאלון', value: funnel.startedQ },
        { label: 'סיימו שאלון', value: funnel.finishedQ },
        { label: 'רכשו אחרי שסיימו שאלון', value: funnel.bought, sub: `לא אחוז ההמרה הכללי (${conversion})` },
      ]} />
    </section>
  );
}

/** מבחנים: עשו מבחן = עברו + נכשלו + בלי תוצאה (הנחיית המנהל 3/11/2026) */
export function ExamsCard({ ex, by, setBy, auto, passFail, passFailBy, byFamily, bySize, byPlatform, tests, testMatrix, open, onToggle }: {
  ex: ExamSummary;
  by: Bucket | null;
  setBy: (b: Bucket | null) => void;
  auto: Bucket;
  passFail: { key: string; passed: number; failed: number }[];
  passFailBy: Bucket;
  byFamily: PassFailRow[];
  bySize: PassFailRow[];
  byPlatform: PassFailRow[];
  tests: PassFailRow[];
  testMatrix: Matrix;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Fold
      id="exams" title="מבחנים" open={open} onToggle={onToggle}
      stats={[
        { label: 'עשו מבחן', value: nf.format(ex.did) },
        { label: 'עברו', value: nf.format(ex.passed) },
        { label: 'אחוז מעבר', value: pctOf(ex.passRate) },
      ]}
    >
      <div className="cardhead">
        <span />
        <BucketChips value={by} auto={auto} onChange={setBy} />
      </div>
      <Stats items={[
        { label: 'עשו מבחן', value: nf.format(ex.did), sub: 'עברו + נכשלו + בלי תוצאה' },
        { label: 'עברו', value: nf.format(ex.passed), info: 'התאריך הוא תאריך הכניסה של הליד. עד 19/10 שם המבחן לא נרשם, ולכן הפילוח לפי סוג כולל רק מבחנים עם שם.' },
        { label: 'נכשלו', value: nf.format(ex.failed) },
        {
          label: 'בלי תוצאה', value: nf.format(ex.overwritten),
          info: 'יש שם מבחן, אבל הסטטוס הוא "לקוח פעיל": מי שעבר ואז רכש מקבל בטבלה "לקוח פעיל", והתוצאה שלו נדרסת.',
        },
        { label: 'אחוז מעבר', value: pctOf(ex.passRate), ring: ex.passRate },
        { label: 'עברו ורכשו', value: nf.format(ex.passedAndBought), sub: 'מהעוברים', ring: ex.passed ? ex.passedAndBought / ex.passed : null },
      ]} />
      <Columns
        labels={passFail.map((d) => fmtBucket(d.key, passFailBy))}
        values={passFail.map((d) => [d.passed, d.failed])}
        series={[{ key: 'passed', label: 'עברו', color: '--series-1' }, { key: 'failed', label: 'נכשלו', color: '--notbot' }]}
      />
      <ListBlock title="פירוט" items={[
        { id: 'family', title: 'לפי סוג', render: () => <SplitList items={byFamily} /> },
        { id: 'size', title: 'לפי גודל חשבון', render: () => <SplitList items={bySize} /> },
        { id: 'platform', title: 'לפי פלטפורמה', render: () => <SplitList items={byPlatform} /> },
        { id: 'tests', title: 'כל המבחנים', count: `${nf.format(tests.length)} מבחנים`, render: () => <SplitList items={tests} max={200} /> },
        { id: 'testmonths', title: 'כמה נעשו מכל מבחן, לפי חודש', render: () => <HeatTable {...testMatrix} nameHeader="מבחן" /> },
      ]} />
    </Fold>
  );
}

/** מקור הגעה של הלידים, ומקור הרכישה (utm) שעבר מכרטיס הרכישות */
export function SourcesCard({ bySource, bySourceRaw, purchases, open, onToggle }: { bySource: SourceRow[]; bySourceRaw: SourceRow[]; purchases: Purchase[]; open: boolean; onToggle: () => void }) {
  const sources = purchaseSources(purchases);
  return (
    <Fold
      id="sources" title="מקור הגעה" open={open} onToggle={onToggle}
      stats={[
        { label: 'מקורות', value: nf.format(bySource.length) },
        { label: 'מקור מוביל', value: bySource[0]?.name ?? '-' },
      ]}
      info={(
        <>
          &quot;בוט וואטסאפ&quot;: נכנסו דרך הבוט. שם של ערוץ (ig, google, Klaviyo, vitrue): utm של האתר. &quot;מהאתר (מבחן או רכישה)&quot;: בטבלה כתוב שם של מבחן או מוצר במקום
          מקור, כלומר הגיעו מהאתר בלי utm.
        </>
      )}
    >
      <div className="two">
        <div>
          <h3>לידים</h3>
          <BarList items={bySource.map((r) => ({ name: r.name, count: r.leads }))} extra={(n) => { const r = bySource.find((x) => x.name === n); return r ? `רכשו ${nf.format(r.bought)}` : null; }} />
        </div>
        <div>
          <h3>מקור הרכישה (utm) <Info>&quot;מקור הגעה&quot; בלשונית הרכישות: ה-utm_source שהגיע עם הרכישה, או שם המוצר כשלא היה utm. נרשם מ-27/10.</Info></h3>
          <BarList items={sources.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = sources.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
        </div>
      </div>
      <ListBlock items={[{
        id: 'raw', title: 'הרשימה המלאה, כמו שכתוב בטבלה', count: `${nf.format(bySourceRaw.length)} מקורות`,
        render: () => (
          <SimpleTable
            max={200}
            headers={['מקור הגעה', 'לידים', 'התחילו שיחה', 'רכשו', 'שולם']}
            rows={bySourceRaw.map((r) => ({ key: r.name, cells: [r.name, nf.format(r.leads), nf.format(r.started), nf.format(r.bought), money.format(r.spent)] }))}
          />
        ),
      }]} />
    </Fold>
  );
}

/** דרופ דאון אחד בתחתית לשונית הצוות, "איך נספר", לפי סקשן. סגור כברירת מחדל */
export function HowCounted({ gaps }: { gaps: { first: string | null; missing: string[] } }) {
  const parts: [string, string[]][] = [
    ['מה הבוט הביא ומה הבוט עושה', [
      'של הבוט = "כן" בעמודה "של הבוט" בלשונית הרכישות. כל ערך אחר = לא של הבוט. תא ריק = עוד לא הוכרע. את העמודה ואת "סיבה" ממלא הסוכן של המנהל בכל לילה, באיחור מכוון של יום או יומיים.',
      'החלק של הבוט: € של הבוט מתוך כל ההכנסות בטווח, כולל מה שעוד לא הוכרע.',
      'שיחות מכירה, קופונים אישיים וקישורים: חלקים נפרדים מה-€ של הבוט לפי "סיבה" (לפי תחילת הערך), ולכן הסכום שלהם לא גדול מה-€ של הבוט.',
      `דיוורים: רכישות של נמענים עד ${MAILING_WINDOW_HOURS} שעות אחרי השליחה, מכל הקמפיינים. הפופאפ: שיחות אמיתיות, וה-€ של רכישות הבוט אחרי הכניסה. שניהם יכולים לחפוף לסיבות אחרות.`,
      'השוואה לתקופה הקודמת (▲▼): באותו אורך, צמוד לפני הטווח שבחרת. רק ב-7 ימים, 30 יום, החודש והחודש הקודם.',
    ]],
    ['לידים והמשפך', [
      'ליד = אדם, לפי קוד מזהה. שורות מלפני 1/9/2026 והזמנות בדיקה לא נכנסות.',
      `קנו באתר בלי לעבור בבוט: ליד שנוצר עד ${SITE_BUY_MINUTES} דקות לפני הרכישה הראשונה שלו, או אחריה. לא נכנס למשפך ולאחוז ההמרה.`,
      'במשפך כל שלב סופר רק מי שעבר גם את השלבים שלפניו. השלב האחרון ("רכשו אחרי שסיימו שאלון") הוא לא אחוז ההמרה הכללי.',
      'אופן שיחה: נבדק לפי המילה הראשונה, כך ש"מכירתי" נספר כ"מכירתית".',
    ]],
    ['רכישות', [
      'רכישה = שורה בלשונית "רכישות", לפי תאריך הרכישה. קונים = קודים מזהים שונים.',
      'שורות בלשונית הרכישות עם תאריך לפני 1/9/2026 לא נכנסות.',
      'רכישה כפולה (אותו קונה ואותו סכום בתוך שתי דקות) נספרת פעם אחת. רכישה בלי סכום נספרת, אבל לא נכנסת לסכומים ולממוצע.',
      'קונה שמסומן בלשונית הלידים ואין לו שורה ברכישות: הרכישה נלקחת משורת הליד, ונחשבת עוד לא הוכרעה.',
      `דמי הפעלה: מוצר עם activation, או רכישה בלי שם מוצר בסכום ${ACTIVATION_AMOUNTS.join(', ')}.`,
      'עד 20/10 שם המוצר לא נרשם: רכישה כזו בלי שם מופיעה כ"לפני 20/10 (בלי שם מוצר)".',
      ...(gaps.first
        ? [`לשונית "רכישות" מתחילה בפועל ב-${fmtDay(gaps.first)}${gaps.missing.length ? `, וב-${gaps.missing.map(fmtDay).join(' וב-')} אין בה שורות: בגרף מסומן "אין נתונים"` : ''}.`]
        : []),
    ]],
    ['קופונים', [
      'הופקו: אנשים עם קוד בעמודה "קופון הבוט", לפי "תאריך קופון". העמודה שומרת רק את הקופון האחרון של כל אדם, ולכן זה מינימום. הקופון תקף יום אחד.',
      'שומשו: רכישות עם קוד אישי של הבוט ב"קופון מהרכישה". הלקוח מקליד את הקוד בעצמו, והוובהוק רושם מה הוקלד.',
    ]],
    ['דיוור', [
      'מהלשוניות "דיוורים" ו"דיוורים - סיכום". לא מושפע מטווח התאריכים, חוץ מכרטיס היכולת "דיוורים".',
      `נספרות רכישות של נמענים עד ${MAILING_WINDOW_HOURS} שעות אחרי השליחה: דרך הקישור (utm_source = vitrue), רק הקוד SPOOKY, ושאר הרכישות.`,
    ]],
    ['הפופאפ באתר', [
      `נכנסו מהפופאפ: utm_campaign של האדם הוא ${POPUP}. זמן הכניסה: תאריך הכניסה המוקדם ביותר שלו.`,
      'קנו אחרי הכניסה: לפי השעה, כולל רכישות של אותו אדם תחת קוד מזהה אחר עם אותו טלפון. חוזר = קנה גם לפני הכניסה.',
    ]],
    ['תובנות שיחה', [
      `מהסריקה של המנהל בגיליון, מ-${fmtDay(INSIGHTS_FROM)}. הדשבורד רק סופר. שיחות בדיקה לא נספרות.`,
      'נטשו: ניהלו שיחה ולא קנו. בלי שיחה (לא כתב, הודעה בודדת, רכש בלי שיחה) בנפרד. "לא ברור מהסיכום" נספר כבבדיקה.',
      'פניות: כל שורה היא פנייה. נושא עם פחות מ-5 פניות בטווח נכנס ל"אחר". שאלות ליקיר: לפי מדגם של הצ\'אטים שנקראו.',
    ]],
    ['תקינות מעקב קמפיינים', [
      `קמפיין שלא מולא: {campaignname} ודומיו (Google Ads), {{campaign.name}} ודומיו (Meta). פס אדום מ-${TRACKING_BANNER_MIN} אנשים ב-7 ימים.`,
      'קמפיינים מובילים: רק utm_campaign של הרכישה עצמה, בלי הקמפיין של האדם.',
    ]],
    ['מבחנים', [
      'עברו או נכשלו לפי "סטטוס". עשו מבחן = עברו + נכשלו + בלי תוצאה. בלי תוצאה: יש שם מבחן והסטטוס נדרס ל"לקוח פעיל" אחרי רכישה.',
      'בסוג, גודל או פלטפורמה בלי אף "עבר" מוצג "-" במקום אחוז מעבר.',
    ]],
  ];
  return (
    <section className="card how" id="how" aria-label="איך נספר">
      <ListBlock
        title="איך נספר"
        items={[{
          id: 'how', title: 'הגדרות והערות על הנתונים, לפי סקשן',
          render: () => (
            <div>
              {parts.map(([title, lines]) => (
                <div key={title}>
                  <h3>{title}</h3>
                  <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              ))}
            </div>
          ),
        }]}
      />
    </section>
  );
}
