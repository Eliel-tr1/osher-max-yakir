'use client';

import { useEffect, useRef, useState } from 'react';

export const nf = new Intl.NumberFormat('he-IL');
export const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayShort = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

export function fmtMonth(m: string): string {
  return monthName.format(new Date(`${m}-15T12:00:00Z`));
}

export function fmtDay(d: string): string {
  return dayShort.format(new Date(`${d}T12:00:00Z`));
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

/**
 * עמודות לאורך זמן, אחת או כמה סדרות זו על זו. הזמן זורם משמאל לימין, כמו בכל ציר זמן.
 * ריחוף על עמודה מראה את הערכים המדויקים.
 */
export function Columns({ labels, series, values, height = 180, labelEvery }: {
  labels: string[];
  series: Series[];
  /** values[i][s] = ערך העמודה i בסדרה s */
  values: number[][];
  height?: number;
  labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = labels.length;
  if (!n) return <div ref={box}><p className="empty">אין נתונים בטווח הזה</p></div>;
  const totals = values.map((v) => v.reduce((s, x) => s + x, 0));
  const max = niceMax(Math.max(...totals, 1));
  const H = height;
  const padL = 34;
  const padB = 22;
  const padT = 18;
  const slot = (W - padL - 4) / n;
  const bw = Math.max(2, Math.min(24, slot * 0.7));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const every = labelEvery ?? Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 70))));
  const ticks = [0, max / 2, max];
  return (
    <div className="chart" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={series.map((s) => s.label).join(', ')} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{nf.format(t)}</text>
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
                const h = Math.max(1, bottom - top - (s > 0 ? 2 : 0));
                return <path key={s} d={barPath(x, top, bw, h, isTop)} fill={`var(${series[s].color})`} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {slot >= 28 && totals[i] > 0 && (
                <text x={x + bw / 2} y={y(totals[i]) - 5} className="cap" textAnchor="middle">{nf.format(totals[i])}</text>
              )}
              {(i % every === 0 || i === n - 1) && (
                <text x={x + bw / 2} y={H - 6} className="tick" textAnchor="middle">{labels[i]}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip" dir="rtl" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%` }}>
          <strong>{labels[hover]}</strong>
          {series.map((s, k) => (
            <span key={s.key}><i style={{ background: `var(${s.color})` }} />{s.label}: {nf.format(values[hover][k])}</span>
          ))}
          {series.length > 1 && <span>סך הכול: {nf.format(totals[hover])}</span>}
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
  const r = roundTop ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** רשימה מדורגת עם פס אופקי לכל שורה. הערך ליד קצה הפס. */
export function BarList({ items, color = '--series-1', max: maxShown = 10, selected, onSelect, unit }: {
  items: { name: string; count: number }[];
  color?: string;
  max?: number;
  selected?: string | null;
  onSelect?: (name: string) => void;
  unit?: string;
}) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="empty">אין נתונים בטווח הזה</p>;
  const shown = all ? items : items.slice(0, maxShown);
  const top = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="barlist">
      {shown.map((it) => {
        const Tag = onSelect ? 'button' : 'div';
        return (
          <Tag
            key={it.name}
            className={`barrow${selected === it.name ? ' on' : ''}`}
            {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(it.name), 'aria-pressed': selected === it.name } : {})}
          >
            <span className="name" title={it.name}>{it.name}</span>
            <span className="track">
              <span className="fill" style={{ width: `${(it.count / top) * 100}%`, background: `var(${color})` }} />
            </span>
            <span className="num">{nf.format(it.count)}{unit ? ` ${unit}` : ''}</span>
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
                <th scope="row" title={r.name}>{r.name}</th>
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
