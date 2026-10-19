'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BASE_PATH, REFRESH_MS } from '@/lib/app';
import { unpack } from '@/lib/leads/file';
import type { LeadsFile } from '@/lib/leads/types';
import {
  countBy, inRange, matrixByMonth, monthKey, perDay, productStats, purchases, removedIn, summarize,
} from '@/lib/metrics';
import { PRESETS, rangeFor, type Preset } from '@/lib/ranges';
import { BarList, Columns, HeatTable, fmtDay, fmtMonth, money, nf } from './charts';

const ALL = '';
const timeFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; file: LeadsFile; checkedAt: Date };

export default function Dashboard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [preset, setPreset] = useState<Preset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [source, setSource] = useState(ALL);
  const [proc, setProc] = useState(ALL);
  const [channel, setChannel] = useState<'all' | 'bot'>('all');
  const [product, setProduct] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/data/leads.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLoad({ state: 'ready', file: unpack(await res.json()), checkedAt: new Date() });
    } catch (e) {
      setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'error', message: e instanceof Error ? e.message : String(e) }));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  const file = load.state === 'ready' ? load.file : null;
  const sources = useMemo(() => (file ? countBy(file.leads, (l) => l.source) : []), [file]);
  const processes = useMemo(() => (file ? countBy(file.leads, (l) => l.process) : []), [file]);

  const view = useMemo(() => {
    if (!file) return null;
    const range = rangeFor(preset, new Date(), custom);
    const scoped = file.leads.filter((l) => (source === ALL || l.source === source) && (proc === ALL || l.process === proc));
    const leads = inRange(scoped, range);
    const ps = purchases(leads).filter((p) => channel === 'all' || p.channel === 'bot');
    const days = perDay(leads);
    const monthsAll = [...new Set(purchases(leads).map((p) => monthKey(p.at)))].sort();
    const byMonth = monthsAll.map((m) => {
      const inM = purchases(leads).filter((p) => monthKey(p.at) === m);
      return [inM.filter((p) => p.channel === 'bot').length, inM.filter((p) => p.channel === 'other').length];
    });
    return {
      summary: summarize(leads),
      removed: removedIn(scoped, range),
      days,
      monthsAll,
      byMonth,
      productMatrix: matrixByMonth(ps, (p) => p.product, (p) => p.at),
      products: productStats(ps),
      testsRank: countBy(leads, (l) => l.test),
      testMatrix: matrixByMonth(leads.filter((l) => l.test), (l) => l.test, (l) => l.at),
      processRank: countBy(leads, (l) => l.process),
    };
  }, [file, preset, custom, source, proc, channel]);

  if (load.state === 'loading') return <main className="page"><p className="status" role="status">טוען נתונים...</p></main>;
  if (load.state === 'error' || !file || !view) {
    return (
      <main className="page">
        <h1>דשבורד אושר מקס</h1>
        <p className="notice error" role="alert">לא הצלחתי לקרוא את קובץ הנתונים ({load.state === 'error' ? load.message : ''}). אפשר לרענן בעוד כמה דקות.</p>
      </main>
    );
  }

  const s = view.summary;
  const selected = view.products.find((p) => p.name === product) ?? view.products[0] ?? null;
  const ageMin = (Date.now() - new Date(file.generatedAt).getTime()) / 60000;

  return (
    <main className="page">
      <header className="head">
        <div>
          <h1>דשבורד אושר מקס</h1>
          <p className="sub">
            לידים מהבוט. הנתונים נכונים ל-{timeFmt.format(new Date(file.generatedAt))}, ומתעדכנים כל 5 דקות.
          </p>
        </div>
      </header>

      {file.origin === 'demo' && <p className="notice" role="status">אלה נתוני הדגמה מומצאים, לא הטבלה האמיתית.</p>}
      {file.origin === 'sheet' && ageMin > 20 && (
        <p className="notice" role="status">הנתונים לא התעדכנו כבר {nf.format(Math.round(ageMin))} דקות. ייתכן שיש תקלה בקריאת הטבלה.</p>
      )}

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
        <article className="tile">
          <p className="label">סך הכול לידים</p>
          <p className="value">{nf.format(s.leads)}</p>
          <p className="sub">{nf.format(file.duplicatesRemoved)} כפילויות הוסרו מהטבלה</p>
        </article>
        <article className="tile">
          <p className="label"><i className="key" style={{ background: 'var(--series-1)' }} />שילמו דרך הבוט</p>
          <p className="value">{nf.format(s.paidBot)}</p>
          <p className="sub">{money.format(s.revenueBot)}{s.leads ? ` · ${Math.round((s.paidBot / s.leads) * 100)}% מהלידים` : ''}</p>
        </article>
        <article className="tile">
          <p className="label"><i className="key" style={{ background: 'var(--series-2)' }} />שילמו מחוץ לבוט <span className="tbc">לבירור</span></p>
          <p className="value">{nf.format(s.paidOther)}</p>
          <p className="sub">{money.format(s.revenueOther)} · יש סכום ואין converted</p>
        </article>
        <article className="tile">
          <p className="label">עסקה ממוצעת דרך הבוט</p>
          <p className="value">{s.avgDealBot === null ? '-' : money.format(s.avgDealBot)}</p>
          <p className="sub">כל העסקאות: {s.avgDealAll === null ? '-' : money.format(s.avgDealAll)}</p>
        </article>
        <article className="tile">
          <p className="label">הסירו את עצמם</p>
          <p className="value">{nf.format(view.removed)}</p>
          <p className="sub">לפי תאריך ההסרה</p>
        </article>
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
          series={[{ key: 'bot', label: 'דרך הבוט', color: '--series-1' }, { key: 'other', label: 'מחוץ לבוט (לבירור)', color: '--series-2' }]}
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
              <p className="label">{selected.name}</p>
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
        <h2>מבחנים</h2>
        <p className="hint">איזה מבחן נעשה הכי הרבה, ולמטה לפי חודש.</p>
        <BarList items={view.testsRank} />
        <h3>לפי חודש</h3>
        <HeatTable {...view.testMatrix} nameHeader="מבחן" />
      </section>

      <section className="card">
        <h2>קמפיינים</h2>
        <p className="notice inline">
          בלשונית &quot;לידים&quot; אין עדיין עמודת קמפיין. הבוט אוסף utm_campaign ו-utm_source, אבל הם לא נכתבים לטבלה.
          כשהם ייכתבו, יופיע כאן פילוח לידים ורכישות לפי קמפיין. בינתיים, לפי תהליך:
        </p>
        <BarList items={view.processRank} />
      </section>

      <footer className="foot">
        {nf.format(file.sheetRows)} שורות בטבלה · {nf.format(file.duplicatesRemoved)} כפילויות הוסרו
        {file.skippedRows ? ` · ${nf.format(file.skippedRows)} שורות בלי תאריך כניסה` : ''} · נבדק בדפדפן ב-{timeFmt.format(load.checkedAt)}
      </footer>
    </main>
  );
}
