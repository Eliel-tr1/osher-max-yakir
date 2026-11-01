'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BASE_PATH, REFRESH_MS } from '@/lib/app';
import { unpack } from '@/lib/leads/file';
import type { LeadsFile } from '@/lib/leads/types';
import {
  ACTIVATION_AMOUNTS, annotate, autoBucket, countBy, dupesIn, examSummary, examsByFamily, examsBySize, examsByPlatform, funnel, inRange, matrixByMonth,
  passFailOverTime, POPUP, previousRange, purchaseGaps, removedIn, SITE_BUY_MINUTES, sourceRows, summarize, testStats, timeSeries, TRACKING_BANNER_MIN, withPurchasesAfterEntry,
  type Bucket, type Range,
} from '@/lib/metrics';
import { PRESETS, rangeFor, type Preset } from '@/lib/ranges';
import { AuthProvider, LoginControl } from './auth';
import { BarList, Columns, fmtDateTime, fmtDay, FunnelStrip, HeatTable, Info, ListBlock, SimpleTable, Ring, Sparkline, SplitList, Stats, money, nf, pct, pctOf } from './charts';
import { DataProvider } from './lists';
import { ThemeToggle } from './theme';
import { BotVsRest, type Measure } from './sections/botVsRest';
import { CouponsSection } from './sections/coupons';
import { MailingsSection } from './sections/mailings';
import { PopupSection } from './sections/popup';
import { PurchasesSection, type Channel } from './sections/purchases';
import { BucketChips, fmtBucket } from './sections/shared';
import { trackingBanner, TrackingSection, useTrackingHealth } from './sections/tracking';

const BUCKET_WORD: Record<Bucket, string> = { day: 'יום', week: 'שבוע', month: 'חודש' };
const ALL = '';
const EMPTY: LeadsFile['leads'] = [];
/** הגרסה של הבנייה. כשבשרת יש גרסה אחרת, הדף נטען מחדש לבד (הדפדפן שומר את הדף הישן בזיכרון) */
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';

/** טווחים שמשווים לתקופה הקודמת (הנחיית המנהל, 1/11/2026) */
const COMPARED: Preset[] = ['7d', '30d', 'month', 'prevMonth'];

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; file: LeadsFile; checkedAt: Date };
type Refresh = { state: 'idle' } | { state: 'waiting'; since: number } | { state: 'done' } | { state: 'error'; message: string };

export default function Dashboard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refresh, setRefresh] = useState<Refresh>({ state: 'idle' });
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [source, setSource] = useState(ALL);
  const [proc, setProc] = useState(ALL);
  const [channel, setChannel] = useState<Channel>('all');
  const [measure, setMeasure] = useState<Measure>('count');
  const [leadsBy, setLeadsBy] = useState<Bucket | null>(null);
  const [testsBy, setTestsBy] = useState<Bucket | null>(null);
  const [buysBy, setBuysBy] = useState<Bucket | null>(null);
  /** טווח חדש מחזיר את יחידת הזמן לאוטומטי, כדי ש"7 ימים" לא יוצג כעמודה אחת של חודש */
  const choosePreset = (p: Preset) => {
    setPreset(p);
    setLeadsBy(null);
    setTestsBy(null);
    setBuysBy(null);
  };

  const fetchData = useCallback(async (): Promise<LeadsFile | null> => {
    try {
      const res = await fetch(`${BASE_PATH}/data/leads.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const file = unpack(await res.json());
      setLoad({ state: 'ready', file, checkedAt: new Date() });
      return file;
    } catch (e) {
      setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'error', message: e instanceof Error ? e.message : String(e) }));
      return null;
    }
  }, []);

  useEffect(() => {
    const check = () => {
      fetchData();
      if (!BUILD) return;
      fetch(`${BASE_PATH}/version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { sha?: string } | null) => {
          if (!v?.sha || v.sha === BUILD) return;
          // פעם אחת לכל גרסה, כדי שלא ייווצר מעגל אם הדפדפן מחזיר שוב את הדף הישן
          try {
            if (sessionStorage.getItem('osher-reload') === v.sha) return;
            sessionStorage.setItem('osher-reload', v.sha);
          } catch {
            return;
          }
          window.location.reload();
        })
        .catch(() => null);
    };
    check();
    const id = setInterval(check, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  /** כפתור הרענון: השרת קורא את הטבלה עכשיו (refresh.php), ואז הדף טוען את הנתונים החדשים */
  const startRefresh = useCallback(async () => {
    setRefresh({ state: 'waiting', since: Date.now() });
    try {
      const res = await fetch(`${BASE_PATH}/refresh.php`, { method: 'POST', cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const file = await fetchData();
      if (!file) throw new Error('הנתונים עודכנו בשרת, אבל לא נטענו לדף. אפשר לרענן את הדף.');
      setRefresh({ state: 'done' });
    } catch (e) {
      setRefresh({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [fetchData]);

  const file = load.state === 'ready' ? load.file : null;
  const all = useMemo(() => (file ? annotate(file) : []), [file]);
  const sources = useMemo(() => countBy(all, (l) => l.sourceGroup), [all]);
  const processes = useMemo(() => countBy(all, (l) => l.process), [all]);
  const people = useMemo(() => (file ? withPurchasesAfterEntry(all, file.purchases) : []), [file, all]);
  const health = useTrackingHealth(file?.leads ?? EMPTY, file?.generatedAt ?? '');
  const lookup = useMemo(
    () => ({
      leads: file?.leads ?? EMPTY,
      purchaseIndex: new Map((file?.purchases ?? []).map((p, i) => [p, i] as const)),
      mailingIndex: new Map((file?.mailings ?? []).map((m, i) => [m, i] as const)),
    }),
    [file],
  );
  const rangeKey = `${preset}|${custom.from}|${custom.to}`;

  const view = useMemo(() => {
    if (!file) return null;
    const now = new Date();
    const range = rangeFor(preset, now, custom);
    const scoped = all.filter((l) => (source === ALL || l.sourceGroup === source) && (proc === ALL || l.process === proc));
    const leads = inRange(scoped, range);
    const keep = new Set(scoped.map((l) => l.i));
    const filtered = source === ALL && proc === ALL;
    // רכישות לפי תאריך הרכישה. כשמסננים לפי מקור או תהליך, רק הרכישות של הלידים שנשארו
    const pick = (r: Range) => inRange(file.purchases, r).filter((p) => filtered || (p.lead !== null && keep.has(p.lead)));
    const purchasesAll = pick(range);
    const before = COMPARED.includes(preset) ? previousRange(range, now) : null;
    const auto = autoBucket(leads);
    const lb = leadsBy ?? auto;
    const tb = testsBy ?? auto;
    return {
      range,
      scoped,
      purchasesAll,
      purchasesBefore: before ? pick(before) : null,
      dupes: dupesIn(file.dupes, range),
      summary: summarize(leads, purchasesAll),
      funnel: funnel(leads),
      removed: removedIn(scoped, range),
      auto,
      leadsBy: lb,
      leadsSeries: timeSeries(leads, (l) => l.at, lb, 1, () => [1]),
      exams: examSummary(leads),
      byFamily: examsByFamily(leads),
      bySize: examsBySize(leads),
      byPlatform: examsByPlatform(leads),
      tests: testStats(leads),
      passFail: passFailOverTime(leads, tb),
      passFailBy: tb,
      testMatrix: matrixByMonth(leads.filter((l) => l.test), (l) => l.test, (l) => l.at),
      bySource: sourceRows(leads),
      bySourceRaw: sourceRows(leads, (l) => l.source),
    };
  }, [file, all, preset, custom, source, proc, leadsBy, testsBy]);

  if (load.state === 'loading') return <main className="page"><p className="status" role="status">טוען נתונים...</p></main>;
  if (load.state === 'error' || !file || !view) {
    return (
      <main className="page">
        <h1>דשבורד אושר מקס</h1>
        <p className="notice error" role="alert">לא הצלחתי לקרוא את קובץ הנתונים ({load.state === 'error' ? load.message : ''}). אפשר לרענן את הדף בעוד כמה דקות.</p>
      </main>
    );
  }

  const s = view.summary;
  const ex = view.exams;
  const hasMail = !!(file.mailings && file.mailingWaves && file.mailingWaves.length > 0);
  const hasPopup = people.some((x) => x.lead.campaign === POPUP);
  const jump: [string, string][] = [
    ['bot', 'הבוט מול השאר'], ['buys', 'רכישות'], ['coupons', 'קופונים'], ...(hasMail ? [['mail', 'דיוור'] as [string, string]] : []),
    ...(hasPopup ? [['popup', 'פופאפ'] as [string, string]] : []), ['tracking', 'תקינות קמפיינים'], ['exams', 'מבחנים'], ['sources', 'מקור הגעה'], ['how', 'איך נספר'],
  ];

  return (
    <AuthProvider generatedAt={file.generatedAt}>
      <DataProvider value={lookup}>
        <main className="page">
          <header className="head">
            <div>
              <h1>דשבורד אושר מקס</h1>
              <p className="sub">הנתונים נכונים ל-<bdi>{fmtDateTime(file.generatedAt)}</bdi></p>
            </div>
            <div className="refresh">
              <div className="headbtns">
                <ThemeToggle />
                <button type="button" onClick={startRefresh} disabled={refresh.state === 'waiting'}>
                  {refresh.state === 'waiting' ? 'מעדכן...' : 'רענון מהטבלה'}
                </button>
              </div>
              <span role="status" className={refresh.state === 'error' ? 'err' : ''}>
                {refresh.state === 'waiting' && 'קורא את הטבלה...'}
                {refresh.state === 'done' && 'עודכן עכשיו'}
                {refresh.state === 'error' && refresh.message}
              </span>
              <LoginControl />
            </div>
          </header>

          {file.origin === 'demo' && <p className="notice" role="status">אלה נתוני הדגמה מומצאים, לא הטבלה האמיתית.</p>}
          {trackingBanner(health) && (
            <p className="notice error top-alert" role="alert">
              {nf.format(health.last7)} אנשים ב-7 הימים האחרונים הגיעו ממודעות שה-<bdi>utm_campaign</bdi> שלהן לא מולא. <a href="#tracking">לפרטים</a>
            </p>
          )}

          <section className="filters" aria-label="סינון">
            <div className="chips" role="group" aria-label="טווח תאריכים">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className={preset === p.id ? 'on' : ''} aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}>{p.label}</button>
              ))}
              <button type="button" className={preset === 'custom' ? 'on' : ''} aria-pressed={preset === 'custom'} onClick={() => choosePreset('custom')}>תאריכים אחרים</button>
            </div>
            {preset === 'custom' && (
              <div className="dates">
                <label>מתאריך <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
                <label>עד תאריך <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
              </div>
            )}
            <div className="selects">
              <label>מקור הגעה
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value={ALL}>הכול</option>
                  {sources.map((o) => <option key={o.name} value={o.name}>{o.name} ({nf.format(o.count)})</option>)}
                </select>
              </label>
              <label>תהליך
                <select value={proc} onChange={(e) => setProc(e.target.value)}>
                  <option value={ALL}>הכול</option>
                  {processes.map((o) => <option key={o.name} value={o.name}>{o.name} ({nf.format(o.count)})</option>)}
                </select>
              </label>
            </div>
          </section>

          <nav className="jump" aria-label="קפיצה לסקשן">
            {jump.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>

          <section className="top" aria-label="מספרי מפתח">
            <Tile
              label="לידים" value={nf.format(s.people)} sub={`${nf.format(s.leads)} בלי מי שקנה באתר`}
              info={`כל האנשים בטווח, לפי קוד מזהה. המשפך ואחוז ההמרה בלי ${nf.format(s.siteBuyers)} שנוצרו בלשונית הלידים עד ${SITE_BUY_MINUTES} דקות לפני הרכישה הראשונה שלהם, או אחריה.`}
            />
            <Tile
              label="התחילו שיחה" value={nf.format(s.startedJourney)} ring={s.leads ? s.startedJourney / s.leads : null} sub={`שיחה אמיתית: ${nf.format(s.realConversations)}`}
              info={`ענו לצ'אטבוט (עמודה I). שיחה אמיתית לפי הסוכן שקורא את השיחות: ${nf.format(s.realConversations)} מתוך ${nf.format(s.aiAnalyzed)} שנסרקו, מתוכן מכירתית ${nf.format(s.salesConversations)}.`}
            />
            <Tile label="קונים" value={nf.format(s.buyers)} sub={`${nf.format(s.purchases)} רכישות`} info="קודים מזהים שונים שקנו בטווח, לפי תאריך הרכישה בלשונית הרכישות." />
            <Tile label="שולם" value={money.format(s.totalPaid)} sub={`עסקה ממוצעת ${s.avgDeal === null ? '-' : money.format(s.avgDeal)}`} info="סכום הרכישות בטווח. עסקה ממוצעת: רק רכישות עם סכום." />
            <Tile label="אחוז המרה" ring={s.leads ? s.leadsWhoBought / s.leads : null} value={pct(s.leadsWhoBought, s.leads)} sub={`${nf.format(s.leadsWhoBought)} לידים רכשו`} info="מתוך הלידים בטווח, בלי מי שקנה באתר בלי לעבור בבוט." />
            <Tile label="קנו באתר בלי לעבור בבוט" value={nf.format(s.siteBuyers)} sub="לא במשפך" info={`ליד שנוצר עד ${SITE_BUY_MINUTES} דקות לפני הרכישה הראשונה שלו, או אחריה. לא נכנס למשפך ולאחוז ההמרה.`} />
            <Tile label="הסירו את עצמם" value={nf.format(view.removed)} sub="לפי תאריך ההסרה" />
            <article className="tile sparkcard">
              <div className="sparkhead">
                <p className="label">לידים לפי {BUCKET_WORD[view.leadsBy]}</p>
                <BucketChips value={leadsBy} auto={view.auto} onChange={setLeadsBy} />
              </div>
              <Sparkline labels={view.leadsSeries.map((d) => fmtBucket(d.key, view.leadsBy))} values={view.leadsSeries.map((d) => d.values[0])} />
            </article>
          </section>

          <section className="card slim" aria-labelledby="funnel-h">
            <h2 id="funnel-h">
              מהליד ועד הרכישה{' '}
              <Info>כל שלב סופר רק מי שעבר גם את השלבים שלפניו, ולכן אף שלב לא גדול מהקודם. בלי מי שקנה באתר בלי לעבור בבוט. &quot;רכשו&quot; = מי שגם סיים שאלון.</Info>
            </h2>
            <FunnelStrip steps={[
              { label: 'לידים', value: view.funnel.leads, sub: `בלי ${nf.format(s.siteBuyers)} שקנו באתר` },
              { label: 'התחילו שיחה', value: view.funnel.started },
              { label: 'התחילו שאלון', value: view.funnel.startedQ },
              { label: 'סיימו שאלון', value: view.funnel.finishedQ },
              { label: 'רכשו', value: view.funnel.bought },
            ]} />
          </section>

          <BotVsRest all={view.purchasesAll} prev={view.purchasesBefore} by={buysBy} setBy={setBuysBy} measure={measure} setMeasure={setMeasure} />

          <PurchasesSection all={view.purchasesAll} dupes={view.dupes} channel={channel} setChannel={setChannel} />

          <CouponsSection people={view.scoped} all={view.purchasesAll} range={view.range} rangeKey={rangeKey} />

          {hasMail && <MailingsSection mailings={file.mailings!} waves={file.mailingWaves!} />}

          <PopupSection people={people} range={view.range} rangeKey={rangeKey} />

          <TrackingSection health={health} all={view.purchasesAll} />

          <section className="card" id="exams" aria-labelledby="exams-h">
            <div className="cardhead">
              <h2 id="exams-h">מבחנים</h2>
              <BucketChips value={testsBy} auto={view.auto} onChange={setTestsBy} />
            </div>
            <Stats items={[
              { label: 'עשו מבחן', value: nf.format(ex.did) },
              {
                label: 'עברו', value: nf.format(ex.passed),
                info: `מי שעבר ואז רכש מקבל בטבלה "לקוח פעיל", והתוצאה שלו נדרסת: ${nf.format(ex.overwritten)} כאלה בטווח. עד 19/10 שם המבחן לא נרשם, ולכן הפילוח לפי סוג כולל רק מבחנים עם שם. התאריך הוא תאריך הכניסה של הליד.`,
              },
              { label: 'נכשלו', value: nf.format(ex.failed) },
              { label: 'אחוז מעבר', value: pctOf(ex.passRate), ring: ex.passRate },
              { label: 'עברו ורכשו', value: nf.format(ex.passedAndBought), sub: 'מהעוברים', ring: ex.passed ? ex.passedAndBought / ex.passed : null },
            ]} />
            <Columns
              labels={view.passFail.map((d) => fmtBucket(d.key, view.passFailBy))}
              values={view.passFail.map((d) => [d.passed, d.failed])}
              series={[{ key: 'passed', label: 'עברו', color: '--series-1' }, { key: 'failed', label: 'נכשלו', color: '--series-2' }]}
            />
            <div className="three">
              <div><h3>לפי סוג</h3><SplitList items={view.byFamily} /></div>
              <div><h3>לפי גודל חשבון</h3><SplitList items={view.bySize} /></div>
              <div><h3>לפי פלטפורמה</h3><SplitList items={view.byPlatform} /></div>
            </div>
            <ListBlock items={[
              { id: 'tests', title: 'כל המבחנים', count: `${nf.format(view.tests.length)} מבחנים`, render: () => <SplitList items={view.tests} max={200} /> },
              { id: 'testmonths', title: 'כמה נעשו מכל מבחן, לפי חודש', render: () => <HeatTable {...view.testMatrix} nameHeader="מבחן" /> },
            ]} />
          </section>

          <section className="card" id="sources" aria-labelledby="sources-h">
            <h2 id="sources-h">
              מקור הגעה{' '}
              <Info>
                &quot;בוט וואטסאפ&quot;: נכנסו דרך הבוט. שם של ערוץ (ig, google, Klaviyo, vitrue): utm של האתר. &quot;מהאתר (מבחן או רכישה)&quot;: בטבלה כתוב שם של מבחן או מוצר במקום
                מקור, כלומר הגיעו מהאתר בלי utm.
              </Info>
            </h2>
            <BarList items={view.bySource.map((r) => ({ name: r.name, count: r.leads }))} extra={(n) => { const r = view.bySource.find((x) => x.name === n); return r ? `רכשו ${nf.format(r.bought)}` : null; }} />
            <ListBlock items={[{
              id: 'raw', title: 'הרשימה המלאה, כמו שכתוב בטבלה', count: `${nf.format(view.bySourceRaw.length)} מקורות`,
              render: () => (
                <SimpleTable
                  max={200}
                  headers={['מקור הגעה', 'לידים', 'התחילו שיחה', 'רכשו', 'שולם']}
                  rows={view.bySourceRaw.map((r) => ({ key: r.name, cells: [r.name, nf.format(r.leads), nf.format(r.started), nf.format(r.bought), money.format(r.spent)] }))}
                />
              ),
            }]} />
          </section>

          <HowCounted gaps={purchaseGaps(file.purchases)} />

          <footer className="foot">
            {nf.format(file.sheetRows)} שורות בלשונית הלידים · {nf.format(file.purchaseRows)} שורות בלשונית הרכישות · נבדק בדפדפן ב-<bdi>{fmtDateTime(load.checkedAt.toISOString())}</bdi>
          </footer>
        </main>
      </DataProvider>
    </AuthProvider>
  );
}

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

/** דרופ דאון אחד בתחתית הדף, "איך נספר", לפי סקשן. סגור כברירת מחדל (הנחיית המנהל, 1/11/2026) */
function HowCounted({ gaps }: { gaps: { first: string | null; missing: string[] } }) {
  const parts: [string, string[]][] = [
    ['ראש הדף והמשפך', [
      'ליד = אדם, לפי קוד מזהה. שורות מלפני 1/9/2026 והזמנות בדיקה לא נכנסות.',
      `קנו באתר בלי לעבור בבוט: ליד שנוצר עד ${SITE_BUY_MINUTES} דקות לפני הרכישה הראשונה שלו, או אחריה. לא נכנס למשפך ולאחוז ההמרה.`,
      'במשפך כל שלב סופר רק מי שעבר גם את השלבים שלפניו.',
    ]],
    ['רכישות', [
      'רכישה = שורה בלשונית "רכישות", לפי תאריך הרכישה. קונים = קודים מזהים שונים.',
      'של הבוט = "כן" בעמודה "של הבוט". כל ערך אחר = לא של הבוט. תא ריק = עוד לא הוכרע. את העמודה ואת "סיבה" ממלא הסוכן של המנהל בכל לילה, באיחור מכוון של יום או יומיים.',
      'רכישה כפולה (אותו קונה ואותו סכום בתוך שתי דקות) נספרת פעם אחת. רכישה בלי סכום נספרת, אבל לא נכנסת לסכומים ולממוצע.',
      'קונה שמסומן בלשונית הלידים ואין לו שורה ברכישות: הרכישה נלקחת משורת הליד, ונחשבת עוד לא הוכרעה.',
      `דמי הפעלה: מוצר עם activation, או רכישה בלי שם מוצר בסכום ${ACTIVATION_AMOUNTS.join(', ')}.`,
      'השוואה לתקופה הקודמת (▲▼): באותו אורך, צמוד לפני הטווח שבחרת. רק ב-7 ימים, 30 יום, החודש והחודש הקודם.',
      ...(gaps.first
        ? [`לשונית "רכישות" מתחילה בפועל ב-${fmtDay(gaps.first)}${gaps.missing.length ? `, וב-${gaps.missing.map(fmtDay).join(' וב-')} אין בה שורות: כנראה פער בנתונים, שעדיין נבדק` : ''}.`]
        : []),
    ]],
    ['קופונים', [
      'הופקו: אנשים עם קוד בעמודה "קופון הבוט", לפי "תאריך קופון". העמודה שומרת רק את הקופון האחרון של כל אדם, ולכן זה מינימום.',
      'שומשו: רכישות עם קוד אישי של הבוט ב"קופון מהרכישה". זו אותה ספירה כמו בשורת הקופון האישי בטבלת הקודים.',
    ]],
    ['קמפיין הדיוור', [
      'מהלשוניות "דיוורים" ו"דיוורים - סיכום". לא מושפע מטווח התאריכים.',
      'קנו אחרי השליחה: לא בהכרח בזכות הדיוור. דרך הקישור (utm_source = vitrue): בוודאות מהדיוור.',
    ]],
    ['הפופאפ באתר', [
      `נכנסו מהפופאפ: utm_campaign של האדם הוא ${POPUP}. זמן הכניסה: תאריך הכניסה המוקדם ביותר שלו.`,
      'קנו אחרי הכניסה: לפי השעה, כולל רכישות של אותו אדם תחת קוד מזהה אחר עם אותו טלפון. חוזר = קנה גם לפני הכניסה.',
    ]],
    ['תקינות מעקב קמפיינים', [
      `קמפיין שלא מולא: {campaignname} ודומיו (Google Ads), {{campaign.name}} ודומיו (Meta). פס אדום בראש הדף מ-${TRACKING_BANNER_MIN} אנשים ב-7 ימים.`,
      'קמפיינים מובילים: רק utm_campaign של הרכישה עצמה, בלי הקמפיין של האדם.',
    ]],
    ['מבחנים', [
      'עברו או נכשלו לפי "סטטוס". מי שעבר ואז רכש מקבל "לקוח פעיל" והתוצאה נדרסת.',
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
