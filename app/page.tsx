'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BASE_PATH, REFRESH_MS } from '@/lib/app';
import { unpack } from '@/lib/leads/file';
import type { LeadsFile } from '@/lib/leads/types';
import {
  annotate, autoBucket, BOT_REASON_LABEL, byBot, campaigns, countBy, examSummary, examsByFamily, examsBySize, examsByPlatform, funnel, inRange,
  matrixByMonth, NO_PRODUCT, passFailOverTime, productFamily, productStats, purchaseSources, purchaseSummary, removedIn, sourceRows, summarize,
  testStats, timeSeries, type Bucket, type BotReason,
} from '@/lib/metrics';
import { PRESETS, rangeFor, type Preset } from '@/lib/ranges';
import { BarList, Columns, Fold, FunnelStrip, HeatTable, SimpleTable, Sparkline, SplitList, Stats, fmtDay, fmtMonth, fmtMonthShort, money, nf, pct, pctOf } from './charts';

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'day', label: 'יום' },
  { id: 'week', label: 'שבוע' },
  { id: 'month', label: 'חודש' },
];
const BUCKET_WORD: Record<Bucket, string> = { day: 'יום', week: 'שבוע', month: 'חודש' };

function fmtBucket(key: string, b: Bucket): string {
  return b === 'month' ? fmtMonthShort(key) : b === 'week' ? fmtDay(key) : fmtDay(key);
}

/** בחירת יחידת זמן. null = אוטומטי לפי הטווח */
function BucketChips({ value, auto, onChange }: { value: Bucket | null; auto: Bucket; onChange: (b: Bucket | null) => void }) {
  const current = value ?? auto;
  return (
    <div className="chips small" role="group" aria-label="לפי">
      {BUCKETS.map((b) => (
        <button key={b.id} type="button" className={current === b.id ? 'on' : ''} aria-pressed={current === b.id} onClick={() => onChange(b.id === auto ? null : b.id)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips small" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'on' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

const ALL = '';
const timeFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; file: LeadsFile; checkedAt: Date };
type Refresh = { state: 'idle' } | { state: 'waiting'; since: number } | { state: 'done' } | { state: 'error'; message: string };

const REASONS: BotReason[] = ['converted', 'utm', 'conversation'];

export default function Dashboard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refresh, setRefresh] = useState<Refresh>({ state: 'idle' });
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [source, setSource] = useState(ALL);
  const [proc, setProc] = useState(ALL);
  const [channel, setChannel] = useState<'all' | 'bot'>('all');
  const [measure, setMeasure] = useState<'count' | 'money'>('count');
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
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
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

  const view = useMemo(() => {
    if (!file) return null;
    const range = rangeFor(preset, new Date(), custom);
    const scoped = all.filter((l) => (source === ALL || l.sourceGroup === source) && (proc === ALL || l.process === proc));
    const leads = inRange(scoped, range);
    const keep = new Set(scoped.map((l) => l.i));
    const filtered = source === ALL && proc === ALL;
    // רכישות לפי תאריך הרכישה. כשמסננים לפי מקור או תהליך, רק הרכישות של הלידים שנשארו
    const purchasesAll = inRange(file.purchases, range).filter((p) => filtered || (p.lead !== null && keep.has(p.lead)));
    const ps = purchasesAll.filter((p) => channel === 'all' || byBot(p, file.leads));
    const auto = autoBucket(leads);
    const lb = leadsBy ?? auto;
    const tb = testsBy ?? auto;
    const pb = buysBy ?? autoBucket(purchasesAll);
    const leadsSeries = timeSeries(leads, (l) => l.at, lb, 1, () => [1]);
    return {
      summary: summarize(leads, purchasesAll),
      funnel: funnel(leads),
      removed: removedIn(scoped, range),
      auto,
      leadsBy: lb,
      leadsSeries,
      exams: examSummary(leads),
      byFamily: examsByFamily(leads),
      bySize: examsBySize(leads),
      byPlatform: examsByPlatform(leads),
      tests: testStats(leads),
      passFail: passFailOverTime(leads, tb),
      passFailBy: tb,
      testMatrix: matrixByMonth(leads.filter((l) => l.test), (l) => l.test, (l) => l.at),
      buys: purchaseSummary(ps, file.leads),
      buysAll: purchaseSummary(purchasesAll, file.leads),
      buysBy: pb,
      buysSeries: timeSeries(ps, (p) => p.at, pb, 2, (p) => {
        const v = measure === 'money' ? (p.amount ?? 0) : 1;
        return byBot(p, file.leads) ? [v, 0] : [0, v];
      }),
      families: productStats(ps, file.leads, (p) => productFamily(p.product)),
      products: productStats(ps, file.leads),
      buySources: purchaseSources(ps, file.leads),
      campaigns: campaigns(ps, file.leads),
      productMatrix: matrixByMonth(ps, (p) => productFamily(p.product), (p) => p.at),
      bySource: sourceRows(leads),
      bySourceRaw: sourceRows(leads, (l) => l.source),
    };
  }, [file, all, preset, custom, source, proc, channel, measure, leadsBy, testsBy, buysBy]);

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
  const b = view.buys;
  const scanned = s.aiAnalyzed;
  const botShare = view.buysAll.purchases ? view.buysAll.bot.purchases / view.buysAll.purchases : null;

  return (
    <main className="page">
      <header className="head">
        <div>
          <h1>דשבורד אושר מקס</h1>
          <p className="sub">הנתונים נכונים ל-{timeFmt.format(new Date(file.generatedAt))}.</p>
        </div>
        <div className="refresh">
          <button type="button" onClick={startRefresh} disabled={refresh.state === 'waiting'}>
            {refresh.state === 'waiting' ? 'מעדכן...' : 'רענון מהטבלה'}
          </button>
          <span role="status" className={refresh.state === 'error' ? 'err' : ''}>
            {refresh.state === 'waiting' && 'קורא את הטבלה...'}
            {refresh.state === 'done' && 'עודכן עכשיו'}
            {refresh.state === 'error' && refresh.message}
          </span>
        </div>
      </header>

      {file.origin === 'demo' && <p className="notice" role="status">אלה נתוני הדגמה מומצאים, לא הטבלה האמיתית.</p>}

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

      <section className="top" aria-label="מספרי מפתח">
        <Tile label="סך הכול לידים" value={nf.format(s.leads)} sub={`${nf.format(s.startedJourney)} ענו לצ'אטבוט`} />
        <Tile
          label="התחילו שיחה"
          value={nf.format(s.startedJourney)}
          sub={scanned ? `שיחה אמיתית: ${nf.format(s.realConversations)} מתוך ${nf.format(scanned)} שנסרקו · מכירתית: ${nf.format(s.salesConversations)}` : 'הסוכן עוד לא סרק שיחות בטווח הזה'}
        />
        <Tile label="רכשו" value={nf.format(s.buyers)} sub={`${nf.format(s.purchases)} רכישות לפי תאריך הרכישה`} />
        <Tile label="סך הכול שולם" value={money.format(s.totalPaid)} sub="לפי לשונית הרכישות" />
        <Tile label="עסקה ממוצעת" value={s.avgDeal === null ? '-' : money.format(s.avgDeal)} sub="רכישות עם סכום בלבד" />
        <Tile label="אחוז המרה" value={pct(s.leadsWhoBought, s.leads)} sub={`${nf.format(s.leadsWhoBought)} מהלידים בטווח רכשו`} />
        <Tile label="הסירו את עצמם" value={nf.format(view.removed)} sub="לפי תאריך ההסרה" />
        <article className="tile sparkcard">
          <div className="sparkhead">
            <p className="label">לידים לפי {BUCKET_WORD[view.leadsBy]}</p>
            <BucketChips value={leadsBy} auto={view.auto} onChange={setLeadsBy} />
          </div>
          <Sparkline labels={view.leadsSeries.map((d) => fmtBucket(d.key, view.leadsBy))} values={view.leadsSeries.map((d) => d.values[0])} />
        </article>
      </section>

      <section className="card slim">
        <h2>מהליד ועד הרכישה</h2>
        <FunnelStrip steps={[
          { label: 'לידים', value: view.funnel.leads },
          { label: 'התחילו שיחה', value: view.funnel.started },
          { label: 'התחילו שאלון', value: view.funnel.startedQ },
          { label: 'סיימו שאלון', value: view.funnel.finishedQ },
          { label: 'רכשו', value: view.funnel.bought },
        ]} />
      </section>

      <section className="card">
        <div className="cardhead">
          <h2>מבחנים</h2>
          <BucketChips value={testsBy} auto={view.auto} onChange={setTestsBy} />
        </div>
        <Stats items={[
          { label: 'עשו מבחן', value: nf.format(ex.did) },
          { label: 'עברו', value: nf.format(ex.passed) },
          { label: 'נכשלו', value: nf.format(ex.failed) },
          { label: 'אחוז מעבר', value: pctOf(ex.passRate) },
          { label: 'עברו ורכשו', value: nf.format(ex.passedAndBought), sub: pct(ex.passedAndBought, ex.passed) + ' מהעוברים' },
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
        <p className="hint">
          עד 19/10 שם המבחן לא נרשם בטבלה, ולכן הפילוחים לפי סוג כוללים רק מבחנים עם שם. מי שעבר ואז רכש מקבל בטבלה סטטוס &quot;לקוח פעיל&quot; והתוצאה שלו נדרסת
          {ex.overwritten ? ` (${nf.format(ex.overwritten)} כאלה בטווח)` : ''}. התאריך הוא תאריך הכניסה של הליד.
        </p>
        <Fold title="כל המבחנים" count={view.tests.length}>
          <SplitList items={view.tests} max={100} />
        </Fold>
        <Fold title="כמה נעשו מכל מבחן, לפי חודש">
          <HeatTable {...view.testMatrix} nameHeader="מבחן" />
        </Fold>
      </section>

      <section className="card">
        <div className="cardhead">
          <h2>רכישות</h2>
          <div className="chipsrow">
            <Chips value={channel} onChange={setChannel} label="איזה רכישות" options={[{ id: 'all', label: 'כל הרכישות' }, { id: 'bot', label: 'רק בזכות הבוט' }]} />
            <Chips value={measure} onChange={setMeasure} label="מה למדוד" options={[{ id: 'count', label: 'מספר' }, { id: 'money', label: 'סכום' }]} />
            <BucketChips value={buysBy} auto={autoBucket(file.purchases)} onChange={setBuysBy} />
          </div>
        </div>
        <Stats items={[
          { label: 'רכישות', value: nf.format(b.purchases), sub: b.noAmount ? `${nf.format(b.noAmount)} בלי סכום` : undefined },
          { label: 'סכום', value: money.format(b.totalPaid) },
          { label: 'עסקה ממוצעת', value: b.avgDeal === null ? '-' : money.format(b.avgDeal) },
          { label: 'קונים', value: nf.format(b.buyers), sub: `${nf.format(b.repeatBuyers)} קנו יותר מפעם` },
          { label: 'בזכות הבוט', value: nf.format(view.buysAll.bot.purchases), sub: `${money.format(view.buysAll.bot.paid)} · ${pctOf(botShare)} מהרכישות` },
          { label: 'לא בזכות הבוט', value: nf.format(view.buysAll.other.purchases), sub: money.format(view.buysAll.other.paid) },
        ]} />
        <Columns
          labels={view.buysSeries.map((d) => fmtBucket(d.key, view.buysBy))}
          values={view.buysSeries.map((d) => d.values)}
          series={[{ key: 'bot', label: 'בזכות הבוט', color: '--series-1' }, { key: 'other', label: 'לא בזכות הבוט', color: '--series-2' }]}
          isMoney={measure === 'money'}
        />
        <div className="three">
          <div>
            <h3>לפי סוג מוצר</h3>
            <BarList items={view.families.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = view.families.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
          </div>
          <div>
            <h3>למה בזכות הבוט</h3>
            <BarList items={REASONS.map((r) => ({ name: BOT_REASON_LABEL[r], count: b.reasons[r] }))} max={3} />
            <p className="hint tight">רכישה יכולה לעמוד ביותר מתנאי אחד. converted כולל גם קופון של הבוט.</p>
          </div>
          <div>
            <h3>מקור הרכישה (utm)</h3>
            <BarList items={view.buySources.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = view.buySources.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
          </div>
        </div>
        {view.campaigns.length > 0 && (
          <>
            <h3>לפי קמפיין (utm_campaign)</h3>
            <BarList items={view.campaigns.map((f) => ({ name: f.name, count: f.count }))} extra={(n) => { const f = view.campaigns.find((x) => x.name === n); return f ? money.format(f.revenue) : null; }} />
          </>
        )}
        <p className="hint">
          בזכות הבוט (כלל הברזל): הליד מסומן converted, או שהרכישה הגיעה מלינק של הבוט (utm_source vitrue), או שהייתה שיחה מכירתית לפי הסוכן.
          מקור הרכישה נרשם מ-27/10 והלאה. רכישות בלי סכום נספרות אבל לא נכנסות לסכומים ולממוצע. שם מוצר שלא נרשם מופיע כ&quot;{NO_PRODUCT}&quot;.
        </p>
        <Fold title="כל המוצרים" count={view.products.length}>
          <SimpleTable
            headers={['מוצר', 'רכישות', 'בזכות הבוט', 'סכום', 'ממוצע', 'הכי נמוך', 'הכי גבוה']}
            rows={view.products.map((p) => ({ key: p.name, cells: [p.name, nf.format(p.count), nf.format(p.bot), money.format(p.revenue), p.avg === null ? '-' : money.format(p.avg), p.min === null ? '-' : money.format(p.min), p.max === null ? '-' : money.format(p.max)] }))}
          />
        </Fold>
        <Fold title="סוגי מוצרים לפי חודש">
          <HeatTable {...view.productMatrix} nameHeader="סוג מוצר" />
        </Fold>
      </section>

      <section className="card">
        <h2>מקור הגעה</h2>
        <p className="hint tight">
          &quot;בוט וואטסאפ&quot;: נכנסו דרך הבוט. שם של ערוץ (ig, google, Klaviyo, vitrue): utm של האתר. &quot;מהאתר (מבחן או רכישה)&quot;: בטבלה כתוב שם של מבחן או מוצר במקום מקור, כלומר הגיעו מהאתר בלי utm.
        </p>
        <BarList items={view.bySource.map((r) => ({ name: r.name, count: r.leads }))} extra={(n) => { const r = view.bySource.find((x) => x.name === n); return r ? `רכשו ${nf.format(r.bought)}` : null; }} />
        <Fold title="הרשימה המלאה, כמו שכתוב בטבלה" count={view.bySourceRaw.length}>
          <SimpleTable
            headers={['מקור הגעה', 'לידים', 'התחילו שיחה', 'רכשו', 'שולם']}
            rows={view.bySourceRaw.map((r) => ({ key: r.name, cells: [r.name, nf.format(r.leads), nf.format(r.started), nf.format(r.bought), money.format(r.spent)] }))}
          />
        </Fold>
      </section>

      <footer className="foot">
        {nf.format(file.sheetRows)} שורות בלשונית הלידים · {nf.format(file.purchaseRows)} שורות בלשונית הרכישות · נבדק בדפדפן ב-{timeFmt.format(load.checkedAt)}
      </footer>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className="tile">
      <p className="label">{label}</p>
      <p className="value">{value}</p>
      <p className="sub">{sub}</p>
    </article>
  );
}
