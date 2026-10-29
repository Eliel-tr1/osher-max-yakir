'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export const nf = new Intl.NumberFormat('he-IL');
export const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' });
const dayShort = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

export function fmtMonth(m: string): string {
  return monthName.format(new Date(`${m}-15T12:00:00Z`));
}

export function fmtMonthShort(m: string): string {
  return monthShort.format(new Date(`${m}-15T12:00:00Z`));
}

export function fmtDay(d: string): string {
  return dayShort.format(new Date(`${d}T12:00:00Z`));
}

const pctFmt = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 0 });
export function pct(part: number, whole: number): string {
  return whole ? pctFmt.format(part / whole) : '-';
}
export function pctOf(ratio: number | null): string {
  return ratio === null ? '-' : pctFmt.format(ratio);
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export interface Series {
  key: string;
  label: string;
  /** משתנה CSS של הצבע */
  color: string;
}

function useWidth(initial = 640) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(initial);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, W };
}

/**
 * עמודות לאורך זמן, אחת או כמה סדרות זו על זו. הזמן זורם משמאל לימין, כמו בכל ציר זמן.
 * ריחוף על עמודה מראה את הערכים המדויקים. money: הערכים הם כסף.
 */
export function Columns({ labels, series, values, height = 150, labelEvery, isMoney }: {
  labels: string[];
  series: Series[];
  /** values[i][s] = ערך העמודה i בסדרה s */
  values: number[][];
  height?: number;
  labelEvery?: number;
  isMoney?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { box, W } = useWidth();
  const n = labels.length;
  if (!n) return <div ref={box}><p className="empty">אין נתונים בטווח הזה</p></div>;
  const f = isMoney ? money : nf;
  const totals = values.map((v) => v.reduce((s, x) => s + x, 0));
  const max = niceMax(Math.max(...totals, 1));
  const H = height;
  const padL = isMoney ? 52 : 34;
  const padB = 20;
  const padT = 16;
  const slot = (W - padL - 4) / n;
  const bw = Math.max(2, Math.min(28, slot * 0.72));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const every = labelEvery ?? Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 64))));
  const ticks = [0, max / 2, max];
  return (
    <div className="chart" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={series.map((s) => s.label).join(', ')} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{f.format(t)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = padL + slot * i + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={labels[i]} onMouseEnter={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {v.map((val, s) => {
                if (!val) return null;
                const top = y(acc + val);
                const bottom = y(acc);
                acc += val;
                const isTop = v.slice(s + 1).every((z) => !z);
                const h = Math.max(1, bottom - top - (s > 0 ? 1.5 : 0));
                return <path key={s} d={barPath(x, top, bw, h, isTop)} fill={`var(${series[s].color})`} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {slot >= 34 && totals[i] > 0 && (
                <text x={x + bw / 2} y={y(totals[i]) - 4} className="cap" textAnchor="middle">{isMoney ? nf.format(Math.round(totals[i])) : nf.format(totals[i])}</text>
              )}
              {(i % every === 0 || i === n - 1) && (
                <text x={x + bw / 2} y={H - 5} className="tick" textAnchor="middle">{labels[i]}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip" dir="rtl" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%` }}>
          <strong>{labels[hover]}</strong>
          {series.map((s, k) => (
            <span key={s.key}><i style={{ background: `var(${s.color})` }} />{s.label}: {f.format(values[hover][k])}</span>
          ))}
          {series.length > 1 && <span>סך הכול: {f.format(totals[hover])}</span>}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend" dir="rtl">
          {series.map((s) => <span key={s.key}><i style={{ background: `var(${s.color})` }} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}

/** עמודה עם פינות מעוגלות רק בקצה העליון, ישרה בבסיס. */
function barPath(x: number, y: number, w: number, h: number, roundTop: boolean): string {
  const r = roundTop ? Math.min(3, w / 2, h) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** גרף קטן בלי צירים, לכרטיס בחלק העליון. ריחוף מראה את הערך. */
export function Sparkline({ labels, values, color = '--series-1', height = 56 }: { labels: string[]; values: number[]; color?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const { box, W } = useWidth(260);
  const n = values.length;
  if (!n) return <div ref={box} className="spark"><p className="empty">אין נתונים</p></div>;
  const max = Math.max(...values, 1);
  const slot = W / n;
  const bw = Math.max(1.5, slot * 0.66);
  return (
    <div className="spark" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label="לידים לאורך זמן" onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const h = Math.max(1, (height - 4) * (v / max));
          return (
            <g key={labels[i]} onMouseEnter={() => setHover(i)}>
              <rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              <rect x={slot * i + (slot - bw) / 2} y={height - h} width={bw} height={h} rx={1.5} fill={`var(${color})`} opacity={hover === null || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
      </svg>
      <div className="sparkfoot" dir="rtl">
        {hover === null ? <><span>{labels[0]}</span><span>{labels[n - 1]}</span></> : <strong>{labels[hover]}: {nf.format(values[hover])}</strong>}
      </div>
    </div>
  );
}

/** שורת מספרים קטנים בתוך כרטיס */
export function Stats({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div key={s.label} className="stat">
          <span className="label">{s.label}</span>
          <span className="value">{s.value}</span>
          {s.sub && <span className="sub">{s.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/** רשימה מדורגת עם פס אופקי לכל שורה. הערך ליד קצה הפס, ואפשר להוסיף ערך משני (למשל סכום). */
export function BarList({ items, color = '--series-1', max: maxShown = 8, selected, onSelect, extra }: {
  items: { name: string; count: number }[];
  color?: string;
  max?: number;
  selected?: string | null;
  onSelect?: (name: string) => void;
  /** טקסט נוסף לשורה, למשל סכום */
  extra?: (name: string) => string | null;
}) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="empty">אין נתונים בטווח הזה</p>;
  const shown = all ? items : items.slice(0, maxShown);
  const top = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="barlist">
      {shown.map((it) => {
        const Tag = onSelect ? 'button' : 'div';
        const ex = extra?.(it.name);
        return (
          <Tag
            key={it.name}
            className={`barrow${selected === it.name ? ' on' : ''}`}
            {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(it.name), 'aria-pressed': selected === it.name } : {})}
          >
            <span className="name" title={it.name} dir="auto">{it.name}</span>
            <span className="track">
              <span className="fill" style={{ width: `${(it.count / top) * 100}%`, background: `var(${color})` }} />
            </span>
            <span className="num">{nf.format(it.count)}{ex ? <small>{ex}</small> : null}</span>
          </Tag>
        );
      })}
      {items.length > maxShown && (
        <button type="button" className="more" onClick={() => setAll(!all)}>
          {all ? 'להציג פחות' : `להציג את כל ה-${nf.format(items.length)}`}
        </button>
      )}
    </div>
  );
}

/** רשימה של עבר מול לא עבר: פס בשני צבעים ואחוז מעבר. */
export function SplitList({ items, max: maxShown = 8 }: { items: { name: string; passed: number; failed: number; total: number; passRate: number | null }[]; max?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="empty">אין מבחנים בטווח הזה</p>;
  const shown = all ? items : items.slice(0, maxShown);
  const top = Math.max(...items.map((i) => i.total), 1);
  return (
    <div className="barlist">
      {shown.map((it) => (
        <div key={it.name} className="barrow split">
          <span className="name" title={it.name} dir="auto">{it.name}</span>
          <span className="track" title={`עברו ${nf.format(it.passed)}, נכשלו ${nf.format(it.failed)}`}>
            <span className="fill" style={{ width: `${(it.passed / top) * 100}%`, background: 'var(--series-1)' }} />
            <span className="fill second" style={{ width: `${(it.failed / top) * 100}%`, insetInlineStart: `${(it.passed / top) * 100}%`, background: 'var(--series-2)' }} />
          </span>
          <span className="num">{nf.format(it.total)}<small>{it.passRate === null ? '' : `${pctOf(it.passRate)} עברו`}</small></span>
        </div>
      ))}
      {items.length > maxShown && (
        <button type="button" className="more" onClick={() => setAll(!all)}>
          {all ? 'להציג פחות' : `להציג את כל ה-${nf.format(items.length)}`}
        </button>
      )}
    </div>
  );
}

/** חלק מקופל: נפתח רק בלחיצה. */
export function Fold({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <details className="fold">
      <summary>{title}{count !== undefined ? <span className="count">{nf.format(count)}</span> : null}</summary>
      <div className="foldbody">{children}</div>
    </details>
  );
}

/** טבלה של שם מול חודש. כל תא מראה את המספר המדויק, והרקע מתחזק לפי הגודל. */
export function HeatTable({ months, rows, monthTotals, maxRows = 12, nameHeader }: {
  months: string[];
  rows: { name: string; total: number; byMonth: number[] }[];
  monthTotals: number[];
  maxRows?: number;
  nameHeader: string;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="empty">אין נתונים בטווח הזה</p>;
  const shown = all ? rows : rows.slice(0, maxRows);
  const peak = Math.max(...rows.flatMap((r) => r.byMonth), 1);
  return (
    <div className="heat">
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{nameHeader}</th>
              {months.map((m) => <th key={m} scope="col">{fmtMonth(m)}</th>)}
              <th scope="col">סך הכול</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <th scope="row" title={r.name} dir="auto">{r.name}</th>
                {r.byMonth.map((v, i) => (
                  <td key={months[i]} style={v ? { background: `color-mix(in srgb, var(--series-1) ${Math.round(8 + (v / peak) * 42)}%, transparent)` } : undefined}>
                    {v ? nf.format(v) : ''}
                  </td>
                ))}
                <td className="total">{nf.format(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">סך הכול</th>
              {monthTotals.map((v, i) => <td key={months[i]}>{nf.format(v)}</td>)}
              <td className="total">{nf.format(monthTotals.reduce((s, v) => s + v, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > maxRows && (
        <button type="button" className="more" onClick={() => setAll(!all)}>
          {all ? 'להציג פחות' : `להציג את כל ה-${nf.format(rows.length)}`}
        </button>
      )}
    </div>
  );
}

/** טבלה פשוטה: כותרות ושורות של טקסט מוכן. */
export function SimpleTable({ headers, rows, max: maxShown = 15 }: { headers: string[]; rows: { key: string; cells: ReactNode[] }[]; max?: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="empty">אין נתונים בטווח הזה</p>;
  const shown = all ? rows : rows.slice(0, maxShown);
  return (
    <div className="heat simple">
      <div className="scroll">
        <table>
          <thead><tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                {r.cells.map((c, i) => (i === 0 ? <th key={i} scope="row" dir="auto" title={typeof c === 'string' ? c : undefined}>{c}</th> : <td key={i}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > maxShown && (
        <button type="button" className="more" onClick={() => setAll(!all)}>
          {all ? 'להציג פחות' : `להציג את כל ה-${nf.format(rows.length)}`}
        </button>
      )}
    </div>
  );
}

/** משפך: שלבים עם אחוז מהשלב הראשון */
export function FunnelStrip({ steps }: { steps: { label: string; value: number }[] }) {
  const base = steps[0]?.value ?? 0;
  return (
    <ol className="funnel">
      {steps.map((s, i) => (
        <li key={s.label} style={{ ['--w' as string]: `${base ? Math.max(6, (s.value / base) * 100) : 0}%` }}>
          <span className="bar" />
          <span className="label">{s.label}</span>
          <span className="value">{nf.format(s.value)}</span>
          <span className="pct">{i === 0 ? '' : pct(s.value, base)}</span>
        </li>
      ))}
    </ol>
  );
}
