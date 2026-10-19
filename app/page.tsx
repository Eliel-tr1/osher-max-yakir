'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_PATH, REFRESH_MS } from '@/lib/app';
import { unpack } from '@/lib/leads/file';
import type { Lead, LeadsFile } from '@/lib/leads/types';
import {
  breakdown, countBy, inRange, matrixByMonth, monthKey, passFailOverTime, perDay, productStats, purchases,
  MODES, removedIn, resultOf, RESULT_ORDER, summarize, testStats, UNSET,
} from '@/lib/metrics';
import { PRESETS, rangeFor, type Preset } from '@/lib/ranges';
import { BarList, BreakdownTable, Columns, HeatTable, TestTable, fmtDay, fmtMonth, money, nf, pct } from './charts';

const ALL = '';
const timeFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; file: LeadsFile; checkedAt: Date };
type Refresh = { state: 'idle' } | { state: 'waiting'; since: number } | { state: 'done' } | { state: 'error'; message: string };
type Group = 'result' | 'mode' | 'process';

const GROUPS: { id: Group; label: string; of: (l: Lead) => string; order?: string[] }[] = [
  { id: 'result', label: 'תוצאת מבחן', of: resultOf, order: RESULT_ORDER },
  { id: 'mode', label: 'אופן שיחה', of: (l) => l.mode ?? UNSET, order: [...MODES, UNSET] },
  { id: 'process', label: 'תהליך', of: (l) => l.process ?? 'לא צוין' },
];

export default function Dashboard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refresh, setRefresh] = useState<Refresh>({ state: 'idle' });
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [source, setSource] = useState(ALL);
  const [proc, setProc] = useState(ALL);
  const [channel, setChannel] = useState<'all' | 'bot'>('all');
  const [group, setGroup] = useState<Group>('result');
  const [product, setProduct] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => {
      clearInterval(id);
      if (poll.current) clearInterval(poll.current);
    };
  }, [fetchData]);

  /** כפתור הרענון: מבקש מהשרת להפעיל קריאה של הטבלה, ומחכה שהנתונים החדשים יעלו */
  const startRefresh = useCallback(async () => {
    setRefresh({ state: 'waiting', since: Date.now() });
    try {
      const res = await fetch(`${BASE_PATH}/refresh.php`, { method: 'POST', cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; requestedAt?: string; error?: string };
      if (!res.ok || !body.ok || !body.requestedAt) throw new Error(body.error ?? `HTTP ${res.status}`);
      const requested = new Date(body.requestedAt).getTime();
      const started = Date.now();
      if (poll.current) clearInterval(poll.current);
      poll.current = setInterval(async () => {
        const file = await fetchData();
        if (file && new Date(file.generatedAt).getTime() >= requested) {
          if (poll.current) clearInterval(poll.current);
          setRefresh({ state: 'done' });
        } else if (Date.now() - started > 4 * 60_000) {
          if (poll.current) clearInterval(poll.current);
          setRefresh({ state: 'error', message: 'העדכון לוקח יותר מהרגיל. אפשר לנסות שוב בעוד כמה דקות.' });
        }
      }, 6000);
    } catch (e) {
      setRefresh({ state: 'error', message: `העדכון לא התחיל (${e instanceof Error ? e.message : String(e)})` });
    }
  }, [fetchData]);

  const file = load.state === 'ready' ? load.file : null;
  const sources = useMemo(() => (file ? countBy(file.leads, (l) => l.source) : []), [file]);
  const processes = useMemo(() => (file ? countBy(file.leads, (l) => l.process) : []), [file]);

  const view = useMemo(() => {
    if (!file) return null;
    const range = rangeFor(preset, new Date(), custom);
    const scoped = file.leads.filter((l) => (source === ALL || l.source === source) && (proc === ALL || l.process === proc));
    const leads = inRange(scoped, range);
    const allPurchases = purchases(leads);
    const ps = allPurchases.filter((p) => channel === 'all' || p.channel === 'bot');
    const days = perDay(leads);
    const monthsAll = [...new Set(allPurchases.map((p) => monthKey(p.at)))].sort();
    const g = GROUPS.find((x) => x.id === group)!;
    const withTest = leads.filter((l) => l.test && (!test || l.test === test));
    const by: 'day' | 'month' = days.length > 62 ? 'month' : 'day';
    return {
      summary: summarize(leads),
      removed: removedIn(scoped, range),
      days,
      monthsAll,
      byMonth: monthsAll.map((m) => {
        const inM = allPurchases.filter((p) => monthKey(p.at) === m);
        return [inM.filter((p) => p.channel === 'bot').length, inM.filter((p) => p.channel === 'other').length];
      }),
      productMatrix: matrixByMonth(ps, (p) => p.product, (p) => p.at),
      products: productStats(ps),
      table: breakdown(leads, g.of, g.order),
      bySource: breakdown(leads, (l) => l.source ?? 'לא צוין'),
      tests: testStats(leads),
      passFail: passFailOverTime(test ? withTest : leads.filter((l) => l.test), by),
      passFailBy: by,
      testMatrix: matrixByMonth(leads.filter((l) => l.test), (l) => l.test, (l) => l.at),
    };
  }, [file, preset, custom, source, proc, channel, group, test]);

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
  const selected = view.products.find((p) => p.name === product) ?? view.products[0] ?? null;
  const g = GROUPS.find((x) => x.id === group)!;

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
            {refresh.state === 'waiting' && 'קורא את הטבלה, בערך דקה'}
            {refresh.state === 'done' && 'עודכן'}
            {refresh.state === 'error' && refresh.message}
          </span>
        </div>
      </header>

      {file.origin === 'demo' && <p className="notice" role="status">אלה נתוני הדגמה מומצאים, לא הטבלה האמיתית.</p>}

      <section className="filters" aria-label="סינון">
        <div className="chips" role="group" aria-label="טווח תאריכים">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={preset === p.id ? 'on' : ''} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
          ))}
          <button type="button" className={preset === 'custom' ? 'on' : ''} aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>תאריכים אחרים</button>
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

      <section className="tiles" aria-label="מספרי מפתח">
        <Tile label="סך הכול לידים" value={nf.format(s.leads)} sub={`${nf.format(file.duplicatesRemoved)} כפילויות הוסרו מהטבלה`} />
        <Tile label="התחילו שיחה" value={nf.format(s.startedJourney)} sub={`${pct(s.startedJourney, s.leads)} מהלידים · ענו לצ'אטבוט`} />
        <Tile label="עברו" value={nf.format(s.passed)} sub={`${pct(s.passed, s.passed + s.failed)} ממי שיש לו תוצאה`} />
        <Tile label="נכשלו" value={nf.format(s.failed)} sub={`${pct(s.failed, s.passed + s.failed)} ממי שיש לו תוצאה`} />
        <Tile label="רכשו" value={nf.format(s.purchased)} sub={`${nf.format(s.purchasedOfStarted)} מתוך מי שהתחיל שיחה (${pct(s.purchasedOfStarted, s.startedJourney)})`} />
        <Tile label="סך הכול שולם" value={money.format(s.totalPaid)} sub={`דרך הבוט ${nf.format(s.paidBot)} (${money.format(s.revenueBot)}) · לא בוט ${nf.format(s.paidOther)} (${money.format(s.revenueOther)})`} />
        <Tile label="עסקה ממוצעת" value={s.avgDealAll === null ? '-' : money.format(s.avgDealAll)} sub={`דרך הבוט: ${s.avgDealBot === null ? '-' : money.format(s.avgDealBot)}`} />
        <Tile label="הסירו את עצמם" value={nf.format(view.removed)} sub="לפי תאריך ההסרה" />
      </section>

      <section className="card">
        <div className="cardhead">
          <h2>מהליד ועד התשלום, לפי {g.label}</h2>
          <div className="chips small" role="group" aria-label="פילוח לפי">
            {GROUPS.map((x) => (
              <button key={x.id} type="button" className={group === x.id ? 'on' : ''} aria-pressed={group === x.id} onClick={() => setGroup(x.id)}>{x.label}</button>
            ))}
          </div>
        </div>
        <p className="hint">התחילו שאלון: עמודה K מלאה. סיימו: finished או converted. רכשו: converted (דרך הבוט) או payment (לא בהכרח דרך הבוט). האחוזים מתוך הלידים בשורה.</p>
        <BreakdownTable data={view.table} groupHeader={g.label} showResult={group !== 'result'} showModes={group !== 'mode'} />
      </section>

      <section className="card">
        <h2>מבחנים: עברו ונכשלו</h2>
        <p className="hint">{test ? <>מוצג: <bdi>{test}</bdi>. </> : 'כל המבחנים. '}לחיצה על מבחן בטבלה מציגה רק אותו{test ? ', ולחיצה נוספת מחזירה לכולם' : ''}. {view.passFailBy === 'month' ? 'לפי חודש.' : 'לפי יום.'}</p>
        <Columns
          labels={view.passFail.map((d) => (view.passFailBy === 'month' ? fmtMonth(d.key) : fmtDay(d.key)))}
          values={view.passFail.map((d) => [d.passed, d.failed])}
          series={[{ key: 'passed', label: 'עברו', color: '--series-1' }, { key: 'failed', label: 'נכשלו', color: '--series-2' }]}
          height={200}
        />
        <TestTable items={view.tests} selected={test} onSelect={setTest} />
        <h3>כמה נעשו מכל מבחן, לפי חודש</h3>
        <HeatTable {...view.testMatrix} nameHeader="מבחן" />
      </section>

      <section className="card">
        <h2>לידים לפי יום</h2>
        <Columns labels={view.days.map((d) => fmtDay(d.day))} values={view.days.map((d) => [d.count])} series={[{ key: 'leads', label: 'לידים', color: '--series-1' }]} />
      </section>

      <section className="card">
        <div className="cardhead">
          <h2>רכישות לפי חודש</h2>
          <div className="chips small" role="group" aria-label="איזה רכישות">
            <button type="button" className={channel === 'all' ? 'on' : ''} aria-pressed={channel === 'all'} onClick={() => setChannel('all')}>כל הרכישות</button>
            <button type="button" className={channel === 'bot' ? 'on' : ''} aria-pressed={channel === 'bot'} onClick={() => setChannel('bot')}>רק דרך הבוט</button>
          </div>
        </div>
        <Columns
          labels={view.monthsAll.map(fmtMonth)}
          values={view.byMonth.map(([b, o]) => (channel === 'bot' ? [b, 0] : [b, o]))}
          series={[{ key: 'bot', label: 'דרך הבוט (converted)', color: '--series-1' }, { key: 'other', label: 'לא בהכרח דרך הבוט (payment)', color: '--series-2' }]}
          height={200}
        />
        <h3>ובתוך כל חודש, לפי מוצר</h3>
        <HeatTable {...view.productMatrix} nameHeader="מוצר" />
      </section>

      <section className="card split">
        <div>
          <h2>מוצרים שנרכשו</h2>
          <p className="hint">שם המוצר לפי &quot;מוצר שנקנה&quot;, ואם ריק לפי &quot;מבחן&quot; (לבירור). לחיצה על מוצר מראה את הסכומים שלו.</p>
          <BarList items={view.products} selected={selected?.name} onSelect={setProduct} />
        </div>
        <aside className="side" aria-live="polite">
          {selected ? (
            <>
              <p className="label" dir="auto">{selected.name}</p>
              <dl>
                <div><dt>נרכש</dt><dd>{nf.format(selected.count)} פעמים</dd></div>
                <div><dt>סכום ממוצע</dt><dd>{selected.avg === null ? '-' : money.format(selected.avg)}</dd></div>
                <div><dt>הכי גבוה</dt><dd>{selected.max === null ? '-' : money.format(selected.max)}</dd></div>
                <div><dt>הכי נמוך</dt><dd>{selected.min === null ? '-' : money.format(selected.min)}</dd></div>
                <div><dt>סך הכול</dt><dd>{money.format(selected.revenue)}</dd></div>
              </dl>
            </>
          ) : <p className="empty">אין רכישות בטווח הזה</p>}
        </aside>
      </section>

      <section className="card">
        <h2>מקור הגעה</h2>
        <p className="hint">לפי עמודת &quot;מקור הגעה&quot;. קמפיינים יתווספו כשהטבלה תכלול עמודת קמפיין (utm_campaign).</p>
        <BreakdownTable data={view.bySource} groupHeader="מקור הגעה" showResult showModes={false} />
      </section>

      <footer className="foot">
        {nf.format(file.sheetRows)} שורות בטבלה · {nf.format(file.duplicatesRemoved)} כפילויות הוסרו
        {file.skippedRows ? ` · ${nf.format(file.skippedRows)} שורות בלי תאריך כניסה` : ''} · נבדק בדפדפן ב-{timeFmt.format(load.checkedAt)}
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
