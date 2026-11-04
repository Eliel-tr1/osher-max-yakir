'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export const nf = new Intl.NumberFormat('he-IL');
export const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
/** מספר עם ספרה אחת אחרי הנקודה, למשל רכישות לקונה */
export function num1(v: number | null): string {
  return v === null ? '-' : dec1.format(v);
}
const ymdIL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const hmIL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "1/11 10:41" בשעון ישראל */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${fmtDay(ymdIL.format(d))} ${hmIL.format(d)}`;
}
/** "1/11" בשעון ישראל */
export function fmtDate(iso: string): string {
  return fmtDay(ymdIL.format(new Date(iso)));
}
/** תאריך כמו שכתוב בגיליון ("28/10/2026", "28-31/10/2026") בלי השנה הנוכחית */
export function fmtSheetDay(v: string | null): string {
  if (!v) return '-';
  return v.replace(new RegExp(`/${thisYear()}$`), '');
}
const monthName = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' });

export function fmtMonth(m: string): string {
  return monthName.format(new Date(`${m}-15T12:00:00Z`));
}

export function fmtMonthShort(m: string): string {
  return monthShort.format(new Date(`${m}-15T12:00:00Z`));
}

/** "19/10" מתוך "2026-10-19". שנה רק כשהיא לא השנה הנוכחית (הנחיית המנהל, 1/11/2026) */
export function fmtDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return y === thisYear() ? `${day}/${m}` : `${day}/${m}/${y}`;
}

function thisYear(): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(new Date()));
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
  // מדרגות צפופות, כדי שהעמודה הגבוהה תמלא את רוב הגובה (חצי התקרה הוא הקו האמצעי, ולכן גם הוא מספר עגול)
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export interface Series {
  key: string;
  label: string;
  /** משתנה CSS של הצבע */
  color: string;
  /** פסים אלכסוניים (עוד לא הוכרע) */
  hatch?: boolean;
}

/** מילוי של סדרה: צבע, או פסים אלכסוניים */
function fillOf(s: Series, id: string): string {
  return s.hatch ? `url(#${id}-hatch)` : `var(${s.color})`;
}

function HatchDef({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--open-a)" />
        <rect width="2" height="6" fill="var(--open-b)" />
      </pattern>
    </defs>
  );
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
export function Columns({ labels, series, values, height = 150, labelEvery, isMoney, note, extraTip, line, gaps }: {
  labels: string[];
  series: Series[];
  /** values[i][s] = ערך העמודה i בסדרה s */
  values: number[][];
  height?: number;
  labelEvery?: number;
  isMoney?: boolean;
  /** כיתוב קטן בתוך הגרף, בפינה העליונה */
  note?: string;
  /** שורה נוספת בחלונית הריחוף, לפי העמודה */
  extraTip?: (i: number) => string | null;
  /** קו של אחוז (0 עד 1) על ציר משני מימין (הנחיית המנהל 3/11/2026). null = אין ערך בתקופה */
  line?: { values: (number | null)[]; label: string; color: string };
  /** תקופות עם ימים בלי שורות בגיליון. full = כל התקופה (פס מקווקו "אין נתונים" ולא 0), אחרת נקודה מתחת לעמודה. text לחלונית */
  gaps?: ({ full: boolean; text: string } | null)[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { box, W } = useWidth();
  const uid = useId().replace(/:/g, '');
  const n = labels.length;
  if (!n) return <div ref={box}><p className="empty">אין נתונים בטווח הזה</p></div>;
  const f = isMoney ? money : nf;
  const totals = values.map((v) => v.reduce((s, x) => s + x, 0));
  const max = niceMax(Math.max(...totals, 1));
  const H = height;
  const padL = isMoney ? 52 : 34;
  const padB = 20;
  const padT = 16;
  const padR = line ? 34 : 4;
  const slot = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(28, slot * 0.72));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const every = labelEvery ?? Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 64))));
  const ticks = [0, max / 2, max];
  const gapLegend: { label: string; color: string; gap: 'full' | 'part' }[] = [
    ...(gaps?.some((g, i) => g?.full && totals[i] === 0) ? [{ label: 'אין נתונים', color: '--ink-3', gap: 'full' as const }] : []),
    ...(gaps?.some((g, i) => g && !(g.full && totals[i] === 0)) ? [{ label: 'חסרים ימים', color: '--ink-3', gap: 'part' as const }] : []),
  ];
  return (
    <div className="chart" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={series.map((s) => s.label).join(', ')} onMouseLeave={() => setHover(null)}>
        {series.some((s) => s.hatch) && <HatchDef id={uid} />}
        {note && <text x={W - 4} y={11} className="tick" textAnchor="start" direction="rtl">{note}</text>}
        {ticks.map((t, k) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{f.format(t)}</text>
            {line && <text x={W - padR + 6} y={y(t) + 4} className="tick" textAnchor="start">{pctFmt.format(k / 2)}</text>}
          </g>
        ))}
        {values.map((v, i) => {
          const x = padL + slot * i + (slot - bw) / 2;
          let acc = 0;
          const gap = gaps?.[i] ?? null;
          return (
            <g key={labels[i]} onMouseEnter={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {gap?.full && totals[i] === 0 && (
                <rect x={x + 0.75} y={padT + 0.75} width={Math.max(1, bw - 1.5)} height={H - padT - padB - 1.5} className="gapbox" rx={2}><title>{gap.text}</title></rect>
              )}
              {gap && !(gap.full && totals[i] === 0) && <circle cx={x + bw / 2} cy={H - padB + 3} r={2} className="gapdot"><title>{gap.text}</title></circle>}
              {v.map((val, s) => {
                if (!val) return null;
                const top = y(acc + val);
                const bottom = y(acc);
                acc += val;
                const isTop = v.slice(s + 1).every((z) => !z);
                const h = Math.max(1, bottom - top - (s > 0 ? 1.5 : 0));
                return <path key={s} d={barPath(x, top, bw, h, isTop)} fill={fillOf(series[s], uid)} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {slot >= 34 && totals[i] > 0 && !line && (
                <text x={x + bw / 2} y={y(totals[i]) - 4} className="cap" textAnchor="middle">{isMoney ? nf.format(Math.round(totals[i])) : nf.format(totals[i])}</text>
              )}
              {(i % every === 0 || i === n - 1) && (
                <text x={x + bw / 2} y={H - 5} className="tick" textAnchor="middle" direction="rtl">{labels[i]}</text>
              )}
            </g>
          );
        })}
        {line && (() => {
          const yl = (v: number) => padT + (H - padT - padB) * (1 - v);
          let d = '';
          line.values.forEach((v, i) => {
            if (v === null) return;
            d += `${i === 0 || line.values[i - 1] === null ? 'M' : 'L'}${(padL + slot * i + slot / 2).toFixed(1)},${yl(v).toFixed(1)} `;
          });
          return (
            <g pointerEvents="none">
              <path d={d} fill="none" stroke={`var(${line.color})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {line.values.map((v, i) => (v === null ? null : <circle key={i} cx={padL + slot * i + slot / 2} cy={yl(v)} r={hover === i ? 4 : 2.5} fill={`var(${line.color})`} stroke="var(--surface)" strokeWidth={1.5} />))}
            </g>
          );
        })()}
      </svg>
      {hover !== null && (
        <div className="tip" dir="rtl" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%` }}>
          <strong>{labels[hover]}</strong>
          {gaps?.[hover] ? <span>{gaps[hover]!.text}</span> : null}
          {line && line.values[hover] !== null ? <span><i className="lineswatch" style={{ background: `var(${line.color})` }} />{line.label}: {pctFmt.format(line.values[hover]!)}</span> : null}
          {series.map((s, k) => (
            <span key={s.key}><i className={s.hatch ? 'hatch' : undefined} style={s.hatch ? undefined : { background: `var(${s.color})` }} />{s.label}: {f.format(values[hover][k])}</span>
          ))}
          {series.length > 1 && <span>סך הכול: {f.format(totals[hover])}</span>}
          {extraTip?.(hover) ? <span>{extraTip(hover)}</span> : null}
        </div>
      )}
      {(series.length > 1 || gapLegend.length > 0) && (
        <Legend items={[...(series.length > 1 ? series : []), ...(line ? [{ label: line.label, color: line.color, line: true }] : []), ...gapLegend]} />
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
export function Sparkline({ labels, values, color = '--series-1', height = 56, format = (v) => nf.format(v), max: fixedMax, label = 'לאורך זמן', caption }: {
  labels: string[];
  /** null = אין ערך בתקופה (בלי עמודה) */
  values: (number | null)[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
  /** תקרה קבועה, למשל 1 לאחוזים */
  max?: number;
  label?: string;
  /** כיתוב קצר באמצע השורה שמתחת, בין התאריך הראשון לאחרון */
  caption?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { box, W } = useWidth(260);
  const n = values.length;
  if (!n) return <div ref={box} className="spark"><p className="empty">אין נתונים</p></div>;
  const max = fixedMax ?? Math.max(...values.map((v) => v ?? 0), 1);
  const slot = W / n;
  const bw = Math.max(1.5, slot * 0.66);
  return (
    <div className="spark" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const h = v === null ? 0 : Math.max(1, (height - 4) * (v / max));
          return (
            <g key={labels[i]} onMouseEnter={() => setHover(i)}>
              <rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              {v !== null && <rect x={slot * i + (slot - bw) / 2} y={height - h} width={bw} height={h} rx={1.5} fill={`var(${color})`} opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
      </svg>
      {/* הזמן זורם משמאל לימין כמו העמודות: התאריך הראשון משמאל והאחרון מימין */}
      <div className="sparkfoot" dir="ltr">
        {hover === null
          ? <><span>{labels[0]}</span>{caption ? <span className="sparkcap" dir="rtl">{caption}</span> : null}<span>{labels[n - 1]}</span></>
          : <strong dir="rtl">{labels[hover]}: {values[hover] === null ? '-' : format(values[hover]!)}</strong>}
      </div>
    </div>
  );
}

/** שורת מספרים קטנים בתוך כרטיס. info: הגדרה ב-ⓘ ליד השם */
export function Stats({ items }: { items: { label: string; value: string; sub?: string; info?: ReactNode; ring?: number | null; ringColor?: string }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div key={s.label} className={`stat${s.ring !== undefined ? ' has-ring' : ''}`}>
          {s.ring !== undefined && <Ring value={s.ring} color={s.ringColor} label={s.label} />}
          <span className="stattext">
            <span className="label">{s.label}{s.info ? <> <Info>{s.info}</Info></> : null}</span>
            <span className="value">{s.value}</span>
            {s.sub && <span className="sub">{s.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** רשימה מדורגת עם פס אופקי לכל שורה. הערך ליד קצה הפס, ואפשר להוסיף ערך משני (למשל סכום). */
export function BarList({ items, color = '--series-1', max: maxShown = 8, selected, onSelect, extra, colorOf, tagOf, part }: {
  items: { name: string; count: number }[];
  color?: string;
  max?: number;
  selected?: string | null;
  onSelect?: (name: string) => void;
  /** טקסט נוסף לשורה, למשל סכום */
  extra?: (name: string) => string | null;
  /** צבע אחר לשורה מסוימת (למשל צבע אזהרה) */
  colorOf?: (name: string) => string | undefined;
  /** כיתוב קטן ליד השם */
  tagOf?: (name: string) => string | null;
  /** חלק מהשורה בצבע הבוט (למשל רכישות של הבוט), והשאר בצבע השורה */
  part?: (name: string) => number;
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
        const bot = part ? Math.min(it.count, part(it.name)) : null;
        return (
          <Tag
            key={it.name}
            className={`barrow${bot !== null ? ' split' : ''}${selected === it.name ? ' on' : ''}`}
            {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(it.name), 'aria-pressed': selected === it.name } : {})}
          >
            {tagOf?.(it.name)
              ? <span className="name has-tag" title={it.name} dir="auto"><span>{it.name}</span><small className="tag">{tagOf(it.name)}</small></span>
              : <span className="name" title={it.name} dir="auto">{it.name}</span>}
            {bot !== null ? (
              <span className="track" title={`של הבוט ${nf.format(bot)} מתוך ${nf.format(it.count)}`}>
                {bot > 0 ? <span className="fill" style={{ width: `${(bot / top) * 100}%`, background: 'var(--bot)' }} /> : null}
                <span className="fill second" style={{ width: `${((it.count - bot) / top) * 100}%`, insetInlineStart: `${(bot / top) * 100}%`, background: `var(${color})` }} />
              </span>
            ) : (
              <span className="track">
                <span className="fill" style={{ width: `${(it.count / top) * 100}%`, background: `var(${colorOf?.(it.name) ?? color})` }} />
              </span>
            )}
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
            <span className="fill second" style={{ width: `${(it.failed / top) * 100}%`, insetInlineStart: `${(it.passed / top) * 100}%`, background: 'var(--notbot)' }} />
          </span>
          <span className="num">{nf.format(it.total)}<small>{it.passed === 0 ? '-' : `${pctOf(it.passRate)} עברו`}</small></span>
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

/**
 * משפך: שלבים עם אחוז מהשלב הראשון. fromPrev: גם אחוז מהשלב הקודם.
 * prev: בסיס אחר לאחוז מהקודם (למשל רכישות ולא קונים); first: false = בלי אחוז מהראשון.
 * pctText: טקסט אחר במקום שני האחוזים, לשלב שלא מוכל בשלב שלפניו.
 */
/**
 * משפך גרפי: פס ממורכז לכל שלב, ברוחב יחסי לשלב הראשון. בין השלבים חץ עם האחוז שעבר מהשלב הקודם
 * (או pctText כשהשלבים לא מוכלים זה בזה). האחוז מהשלב הראשון ליד המספר.
 */
export function FunnelStrip({ steps }: {
  steps: { label: string; value: number; sub?: string; prev?: number; first?: boolean; pctText?: string }[];
  /** לא בשימוש יותר: המשפך תמיד מראה גם מהשלב הקודם וגם מהראשון */
  fromPrev?: boolean;
}) {
  const base = steps[0]?.value ?? 0;
  return (
    <ol className="vfunnel">
      {steps.map((s, i) => {
        const w = base ? Math.min(100, Math.max(3, (s.value / base) * 100)) : 0;
        const showFirst = i > 0 && !s.pctText && s.first !== false;
        return (
          <li key={s.label}>
            {i > 0 && <span className="vconn">{s.pctText ?? `${pct(s.value, s.prev ?? steps[i - 1].value)} מהשלב הקודם`}</span>}
            <span className="vlabel">{s.label}{s.sub ? <span className="vsub">{s.sub}</span> : null}</span>
            <span className="vtrack" aria-hidden><span className="vbar" style={{ width: `${w}%`, opacity: 1 - Math.min(i, 5) * 0.08 }} /></span>
            <span className="vval">{nf.format(s.value)}{showFirst ? <span className="vpct">{pct(s.value, base)}</span> : null}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** פסי אחוז: כל שורה מ-0% עד 100%, עם הטקסט ליד הפס. להשוואת שיעורים בין קבוצות */
export function RateBars({ rows, color = '--bot' }: { rows: { name: string; rate: number | null; sub?: string; color?: string }[]; color?: string }) {
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div key={r.name} className="barrow rate">
          <span className="name" title={r.name}>{r.name}</span>
          <span className="track ratetrack">
            <span className="fill" style={{ width: `${(r.rate ?? 0) * 100}%`, background: `var(${r.color ?? color})` }} />
          </span>
          <span className="num">{pctOf(r.rate)}{r.sub ? <small>{r.sub}</small> : null}</span>
        </div>
      ))}
    </div>
  );
}

/** טבעת אחוז: חלק מתוך שלם, עם האחוז במרכז */
export function Ring({ value, size = 52, color = '--bot', label }: { value: number | null; size?: number; color?: string; label: string }) {
  const r = (size - 7) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pctOf(value)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={7} />
      {v > 0 && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(${color})`} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      )}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ringtext">{value === null ? '-' : `${Math.round(v * 100)}%`}</text>
    </svg>
  );
}

/** מקרא: ריבוע צבע ושם לכל סדרה */
export function Legend({ items }: { items: { label: string; color: string; hatch?: boolean; line?: boolean; gap?: 'full' | 'part' }[] }) {
  return (
    <div className="legend" dir="rtl">
      {items.map((s) => (
        <span key={s.label}>
          <i className={s.hatch ? 'hatch' : s.gap ? `gap${s.gap}` : s.line ? 'lineswatch' : undefined} style={s.hatch || s.gap ? undefined : { background: `var(${s.color})` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export interface BarSegment {
  value: number;
  /** משתנה CSS של הצבע */
  color: string;
  label: string;
  hatch?: boolean;
}

/** טבלה עם פס אופקי בכל שורה, מחולק לפי צבעים: שם, פס, ואז המספרים. */
export function BarTable({ headers, rows, max: maxShown = 10 }: {
  /** [שם, פס, ...עמודות המספרים] */
  headers: string[];
  rows: { key: string; name: ReactNode; title?: string; segments: BarSegment[]; cells: ReactNode[]; group?: boolean }[];
  max?: number;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="empty">אין נתונים בטווח הזה</p>;
  const shown = all ? rows : rows.slice(0, maxShown);
  const top = Math.max(...rows.map((r) => r.segments.reduce((x, g) => x + g.value, 0)), 1);
  return (
    <div className="heat simple bartable">
      <div className="scroll">
        <table>
          <thead><tr>{headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className={r.group ? 'group' : undefined}>
                <th scope="row" dir="auto" title={r.title}>{r.name}</th>
                <td className="barcell">
                  <span className="stack" title={r.segments.filter((g) => g.value).map((g) => `${g.label}: ${nf.format(g.value)}`).join(' · ')}>
                    {r.segments.map((g) => (g.value ? <span key={g.label} className={g.hatch ? 'hatch' : undefined} style={{ width: `${(g.value / top) * 100}%`, ...(g.hatch ? {} : { background: `var(${g.color})` }) }} /> : null))}
                  </span>
                </td>
                {r.cells.map((c, i) => <td key={i}>{c}</td>)}
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

/**
 * ⓘ ליד מספר או כותרת: ההגדרה מופיעה במעבר עכבר או בלחיצה (גם בטלפון). Esc או לחיצה בחוץ סוגרים.
 * החלונית במיקום קבוע על המסך, כדי שלא תגרום לגלילה לצד בטלפון.
 */
export function Info({ children, label = 'הסבר' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const id = useId();
  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);
  useLayoutEffect(() => {
    if (!open || !btn.current) {
      setPos(null);
      return;
    }
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
    // מתחת לאייקון, ואם אין מקום, מעליו
    const h = tip.current?.getBoundingClientRect().height ?? 0;
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below;
    setPos({ left, top, width });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);
  const hoverable = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
  return (
    <span className="info">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
        onMouseEnter={() => hoverable() && setOpen(true)}
        onMouseLeave={() => hoverable() && !pinned && setOpen(false)}
      >
        ⓘ
      </button>
      {open && (
        <span
          ref={tip}
          id={id}
          role="tooltip"
          className="infotip"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, width: Math.min(300, typeof window === 'undefined' ? 300 : window.innerWidth - 24), visibility: 'hidden' }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** שינוי מול התקופה הקודמת: ▲ או ▼ באחוזים. null = אין למה להשוות */
export function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className="delta" title="מול התקופה הקודמת באותו אורך">
      {up ? '▲' : '▼'} {pctFmt.format(Math.abs(value))}
    </span>
  );
}

/** צבע הטקסט על חלק בפס: לבן על כחול, כהה על אפור בהיר */
const ON_PART: Record<string, string> = { '--notbot': 'on-notbot', '--open-a': 'on-light', '--open-b': 'on-light' };

/** פס של 100%: חלק לכל צד, עם האחוז כתוב על החלק כשיש לו מקום */
export function Bars100({ label, parts }: { label: string; parts: { value: number; color: string; hatch?: boolean; text: string; more?: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="bar100">
      <span className="b100label">{label}</span>
      <span className="b100track" role="img" aria-label={parts.map((p) => `${p.text}${p.more ? ` ${p.more}` : ''}`).join(', ')}>
        {parts.map((p) => {
          const w = total ? (p.value / total) * 100 : 0;
          if (!w) return null;
          return (
            <span key={p.color} className={`b100part${p.hatch ? ' hatch on-light' : ''}${ON_PART[p.color] ? ` ${ON_PART[p.color]}` : ''}`} style={{ width: `${w}%`, ...(p.hatch ? {} : { background: `var(${p.color})` }) }} title={`${p.text}${p.more ? ` ${p.more}` : ''}`}>
              {w >= 14 ? <span className="b100text">{p.text}{p.more ? <span className="b100more"> {p.more}</span> : null}</span> : null}
            </span>
          );
        })}
      </span>
    </div>
  );
}

/** טבלה ארוכה: 50 השורות הראשונות, וכפתור "עוד 50" (הנחיית המנהל, 1/11/2026) */
export function MoreTable({ headers, rows, step = 50 }: { headers: string[]; rows: { key: string; cells: ReactNode[] }[]; step?: number }) {
  const [shown, setShown] = useState(step);
  if (!rows.length) return <p className="empty">אין שורות</p>;
  return (
    <div className="heat simple list">
      <div className="scroll">
        <table>
          <thead><tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, shown).map((r) => <tr key={r.key}>{r.cells.map((c, i) => <td key={i} dir="auto">{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button type="button" className="more" onClick={() => setShown(shown + step)}>
          עוד {nf.format(Math.min(step, rows.length - shown))} (מתוך {nf.format(rows.length)})
        </button>
      )}
    </div>
  );
}

/**
 * סקשן מקופל (הנחיית המנהל 3/11/2026): סגור כברירת מחדל, ובכותרת שלו מספרים קטנים או מספר אחד גדול עם משפט.
 * השליטה בפתיחה אצל הדף, כדי שלחיצה על כרטיס יכולת תפתח את הפירוט שלו.
 */
export function Fold({ id, title, stats, big, sentence, open, onToggle, info, className, children, level = 2 }: {
  id: string;
  title: ReactNode;
  /** עד 3 מספרים קטנים בכותרת */
  stats?: { label: string; value: string }[];
  /** מספר אחד גדול ומשפט אחד, לכרטיסי התובנות */
  big?: string;
  sentence?: ReactNode;
  open: boolean;
  onToggle: () => void;
  info?: ReactNode;
  className?: string;
  children: ReactNode;
  level?: 2 | 3;
}) {
  const panel = `${id}-panel`;
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className={`card fold${open ? ' open' : ''}${className ? ` ${className}` : ''}`} id={id}>
      <div className="foldhead">
        <H className="foldtitle">
          <button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
            <span className="ftitle">{title}</span>
            {big !== undefined && <span className="fbig">{big}</span>}
            {sentence !== undefined && <span className="fsent">{sentence}</span>}
            {stats && (
              <span className="fstats">
                {stats.map((s) => <span key={s.label}><b>{s.value}</b> {s.label}</span>)}
              </span>
            )}
            <span className="lchev" aria-hidden="true">⌄</span>
          </button>
        </H>
        {info ? <Info>{info}</Info> : null}
      </div>
      {open ? <div id={panel} className="foldbody">{children}</div> : null}
    </section>
  );
}

export interface ListItem {
  id: string;
  title: string;
  /** "587 רכישות" או "481 אנשים" */
  count?: string;
  sum?: string;
  render: () => ReactNode;
}

/**
 * בלוק "רשימות" בסוף סקשן: שורה לכל רשימה (שם, כמה, סכום, חץ), הכול סגור, ופתיחה של רשימה סוגרת את הקודמת.
 * Enter פותח וסוגר, Esc סוגר. כל רשימות הדף משתמשות ברכיב הזה (הנחיית המנהל, 1/11/2026).
 */
export function ListBlock({ items, title = 'רשימות', note }: { items: ListItem[]; title?: string; note?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId().replace(/:/g, '');
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open && items.some((i) => i.id === open)) {
      const btn = rowRefs.current.get(open);
      // רשימה בתוך רשימה: Esc סוגר רק את הפנימית
      e.stopPropagation();
      setOpen(null);
      btn?.focus();
    }
  };
  if (!items.length) return null;
  return (
    <div className="lists" onKeyDown={onKey}>
      <div className="listshead">
        <h3>{title}</h3>
        {note ? <span className="listsnote">{note}</span> : null}
      </div>
      {items.map((it) => {
        const isOpen = open === it.id;
        const panel = `${base}-${it.id}`.replace(/[^\w-]/g, '_');
        return (
          <div key={it.id} className={`lrow${isOpen ? ' open' : ''}`}>
            <button
              ref={(el) => { if (el) rowRefs.current.set(it.id, el); }}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panel}
              onClick={() => setOpen(isOpen ? null : it.id)}
            >
              <span className="ltitle" dir="auto">{it.title}</span>
              <span className="lcount">{it.count ?? ''}</span>
              <span className="lsum">{it.sum ?? ''}</span>
              <span className="lchev" aria-hidden="true">⌄</span>
            </button>
            {isOpen ? <div id={panel} role="region" aria-label={it.title} className="lpanel">{it.render()}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
