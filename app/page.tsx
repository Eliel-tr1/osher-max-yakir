'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/app';
import { testLeadsOf, type Scope } from '@/lib/insights';
import { unpack } from '@/lib/leads/file';
import type { LeadsFile } from '@/lib/leads/types';
import {
  annotate, autoBucket, capabilities, countBy, dupesIn, examSummary, examsByFamily, examsBySize, examsByPlatform, funnel, inRange, matrixByMonth,
  passFailOverTime, POPUP, previousRange, purchaseGaps, REASON_SALES, removedIn, sourceRows, summarize, testStats, timeSeries, withPurchasesAfterEntry,
  type Bucket, type CapabilityId, type Range,
} from '@/lib/metrics';
import { PRESETS, rangeFor, type Preset } from '@/lib/ranges';
import { AuthProvider, LoginControl, LoginGate } from './auth';
import { fmtDateTime, nf, pct } from './charts';
import { DataProvider } from './lists';
import { ThemeToggle } from './theme';
import { Capabilities } from './sections/capabilities';
import { CouponsSection } from './sections/coupons';
import { BotHero } from './sections/hero';
import { InsightsSection } from './sections/insights';
import { MailingsSection } from './sections/mailings';
import { OverTime } from './sections/overTime';
import { PopupCompare, PopupSection } from './sections/popup';
import { PurchasesSection, type Channel } from './sections/purchases';
import { ExamsCard, FunnelCard, HowCounted, SourcesCard, TeamTiles } from './sections/team';
import { trackingBanner, TrackingSection, useTrackingHealth } from './sections/tracking';

const ALL = '';
const EMPTY: LeadsFile['leads'] = [];
/** הגרסה של הבנייה. כשבשרת יש גרסה אחרת, הדף נטען מחדש לבד (הדפדפן שומר את הדף הישן בזיכרון) */
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';

/** טווחים שמשווים לתקופה הקודמת (הנחיית המנהל, 1/11/2026) */
const COMPARED: Preset[] = ['7d', '30d', 'month', 'prevMonth'];

type Load = { state: 'loading' } | { state: 'locked' } | { state: 'error'; message: string } | { state: 'ready'; file: LeadsFile; checkedAt: Date };
/** שתי לשוניות: הראשית (הבוט קודם) ו"לצוות" (הנחיית המנהל 3/11/2026, #27) */
type Tab = 'main' | 'team';
type Refresh = { state: 'idle' } | { state: 'waiting'; since: number } | { state: 'done' } | { state: 'error'; message: string };

export default function Dashboard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refresh, setRefresh] = useState<Refresh>({ state: 'idle' });
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [source, setSource] = useState(ALL);
  const [proc, setProc] = useState(ALL);
  const [channel, setChannel] = useState<Channel>('all');
  const [tab, setTab] = useState<Tab>('main');
  /** אילו סקשנים פתוחים: הכול סגור כברירת מחדל */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /** הסיבה שהרשימה שלה פתוחה בפירוט הרכישות */
  const [chip, setChip] = useState<string | null>(null);
  const scrollTo = useRef<string | null>(null);
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
      // הנתונים רק אחרי כניסה בסיסמה (1/11/2026). בלי PHP (תצוגה מקומית) נקרא הקובץ הסטטי
      let res = await fetch(`${BASE_PATH}/data.php?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) {
        setLoad({ state: 'locked' });
        return null;
      }
      const isPhp = (res.headers.get('content-type') ?? '').includes('json');
      if (!isPhp || res.status === 404) {
        const local = await fetch(`${BASE_PATH}/data/leads.json?t=${Date.now()}`, { cache: 'no-store' });
        if (local.ok) res = local;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const file = unpack(await res.json());
      setLoad({ state: 'ready', file, checkedAt: new Date() });
      return file;
    } catch (e) {
      setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'error', message: e instanceof Error ? e.message : String(e) }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (window.location.hash === '#team') setTab('team');
  }, []);
  const chooseTab = (t: Tab) => {
    setTab(t);
    try {
      history.replaceState(null, '', t === 'team' ? '#team' : `${window.location.pathname}${window.location.search}`);
    } catch {
      // בלי היסטוריה: הלשונית פשוט לא נשמרת בכתובת
    }
  };
  const toggle = useCallback((id: string) => setOpen((o) => ({ ...o, [id]: !o[id] })), []);
  /** כרטיס יכולת: פותח את הפירוט שלו וגולל אליו */
  const openDetail = useCallback((cap: CapabilityId, target: string) => {
    if (cap === 'sales') setChip(REASON_SALES);
    setOpen((o) => ({ ...o, [target]: true }));
    scrollTo.current = target;
  }, []);
  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(scrollTo.current);
    scrollTo.current = null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // פעם אחת כשהדף נפתח: הנתונים מהשרת, ובדיקה שהדף עצמו לא גרסה ישנה מהמטמון. בלי שום בדיקה חוזרת:
  // הנתונים מתעדכנים רק בכפתור או ברענון של 06:30 (הנחיית המנהל 3/11/2026)
  useEffect(() => {
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
  }, [fetchData]);

  /** כפתור הרענון: השרת קורא את הטבלה עכשיו (refresh.php), ואז הדף טוען את הנתונים החדשים */
  const startRefresh = useCallback(async () => {
    setRefresh({ state: 'waiting', since: Date.now() });
    try {
      const res = await fetch(`${BASE_PATH}/refresh.php`, { method: 'POST', cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 401) {
        setLoad({ state: 'locked' });
        setRefresh({ state: 'idle' });
        return;
      }
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
    const scope: Scope = { range, keep: filtered ? keep : null, testLeads: testLeadsOf(file.insights.analysis?.rows ?? null) };
    const lb = leadsBy ?? auto;
    const tb = testsBy ?? auto;
    return {
      range,
      scoped,
      purchasesAll,
      purchasesEver: pick({ from: null, to: null }),
      purchasesBefore: before ? pick(before) : null,
      caps: capabilities({ leads, couponLeads: scoped, purchases: purchasesAll, people, mailings: file.mailings, range }),
      scope,
      filtered: !filtered,
      missingDays: purchaseGaps(file.purchases).missing,
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
  }, [file, all, people, preset, custom, source, proc, leadsBy, testsBy]);

  if (load.state === 'loading') return <main className="page"><p className="status" role="status">טוען נתונים...</p></main>;
  if (load.state === 'locked') return <LoginGate onIn={() => { setLoad({ state: 'loading' }); fetchData(); }} />;
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
  const red = health.last7 > 0;
  const jump: [string, string][] = tab === 'main'
    ? [
      ['bot', 'מה הבוט הביא'], ['time', 'לאורך זמן'], ['insights', 'תובנות שיחה'], ['buys', 'רכישות'], ['coupons', 'קופונים'],
      ...(hasMail ? [['mail', 'דיוור'] as [string, string]] : []), ...(hasPopup ? [['popup', 'פופאפ'] as [string, string]] : []),
    ]
    : [['funnel', 'משפך'], ['tracking', 'תקינות קמפיינים'], ['exams', 'מבחנים'], ['sources', 'מקור הגעה'], ...(hasPopup ? [['popupcmp', 'פופאפ מול השאר'] as [string, string]] : []), ['how', 'איך נספר']];

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

          <div className="tabs" role="tablist" aria-label="לשוניות">
            <button type="button" role="tab" id="tab-main" aria-selected={tab === 'main'} aria-controls="panel-main" className={tab === 'main' ? 'on' : ''} onClick={() => chooseTab('main')}>הבוט</button>
            <button type="button" role="tab" id="tab-team" aria-selected={tab === 'team'} aria-controls="panel-team" className={tab === 'team' ? 'on' : ''} onClick={() => chooseTab('team')}>
              לצוות{red ? <span className="dot" role="img" aria-label="יש מה לתקן בתקינות הקמפיינים" /> : null}
            </button>
          </div>

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

          {tab === 'main' ? (
            <div role="tabpanel" id="panel-main" aria-labelledby="tab-main">
              <BotHero all={view.purchasesAll} prev={view.purchasesBefore} />
              <Capabilities caps={view.caps} onOpen={openDetail} />
              <OverTime all={view.purchasesAll} missingDays={view.missingDays} by={buysBy} setBy={setBuysBy} />
              <InsightsSection insights={file.insights} generatedAt={file.generatedAt} scope={view.scope} filtered={view.filtered} open={open} toggle={toggle} />
              <section className="details" aria-labelledby="details-h">
                <h2 id="details-h" className="sectlabel">פירוט</h2>
                <PurchasesSection all={view.purchasesAll} channel={channel} setChannel={setChannel} open={!!open.buys} onToggle={() => toggle('buys')} chip={chip} setChip={setChip} />
                <CouponsSection people={view.scoped} all={view.purchasesAll} ever={view.purchasesEver} range={view.range} rangeKey={rangeKey} open={!!open.coupons} onToggle={() => toggle('coupons')} />
                {hasMail && <MailingsSection mailings={file.mailings!} waves={file.mailingWaves!} open={!!open.mail} onToggle={() => toggle('mail')} />}
                {hasPopup && <PopupSection people={people} range={view.range} rangeKey={rangeKey} open={!!open.popup} onToggle={() => toggle('popup')} />}
              </section>
            </div>
          ) : (
            <div role="tabpanel" id="panel-team" aria-labelledby="tab-team">
              {trackingBanner(health) && (
                <p className="notice error top-alert" role="alert">
                  {nf.format(health.last7)} אנשים ב-7 הימים האחרונים הגיעו ממודעות שה-<bdi>utm_campaign</bdi> שלהן לא מולא. <a href="#tracking">לפרטים</a>
                </p>
              )}
              <TeamTiles s={s} removed={view.removed} dupes={view.dupes} leadsSeries={view.leadsSeries} leadsBy={view.leadsBy} autoBucket={view.auto} setLeadsBy={setLeadsBy} />
              <FunnelCard funnel={view.funnel} siteBuyers={s.siteBuyers} conversion={pct(s.leadsWhoBought, s.leads)} />
              <TrackingSection health={health} all={view.purchasesAll} />
              <ExamsCard
                ex={ex} by={testsBy} setBy={setTestsBy} auto={view.auto} passFail={view.passFail} passFailBy={view.passFailBy} byFamily={view.byFamily} bySize={view.bySize}
                byPlatform={view.byPlatform} tests={view.tests} testMatrix={view.testMatrix}
              />
              <SourcesCard bySource={view.bySource} bySourceRaw={view.bySourceRaw} purchases={view.purchasesAll} />
              <PopupCompare people={people} range={view.range} />
              <HowCounted gaps={purchaseGaps(file.purchases)} />
            </div>
          )}

          <footer className="foot">
            {nf.format(file.sheetRows)} שורות בלשונית הלידים · {nf.format(file.purchaseRows)} שורות בלשונית הרכישות · נבדק בדפדפן ב-<bdi>{fmtDateTime(load.checkedAt.toISOString())}</bdi>
          </footer>
        </main>
      </DataProvider>
    </AuthProvider>
  );
}
