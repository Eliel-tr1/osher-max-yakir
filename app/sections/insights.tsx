'use client';

import { useMemo, useState } from 'react';
import {
  abandonView, BOT_FAILURE, feedbackView, inquiryView, lastScan, OTHER, PATHS, questionView, removalView, sampleSize, startsBeforeData, STARTED_Q,
  type ExamFilter, type Indexed, type Scope,
} from '@/lib/insights';
import type { AnalysisRow, FeedbackRow, InquiryRow, Insights } from '@/lib/leads/types';
import { Bars100, BarList, Fold, fmtDate, fmtDateTime, Info, ListBlock, MoreTable, Ring, Sparkline, nf, pct, pctOf } from '../charts';
import { ChatLink, useAuth, useLinkNote, type RowKind } from '../auth';
import { Chips, fmtBucket } from './shared';

/**
 * "תובנות שיחה" (הנחיית המנהל 3/11/2026, #26): ארבעה כרטיסים סגורים ושורת הסרות. כל כרטיס מראה בכותרת מספר אחד ומשפט
 * אחד, והפירוט נפתח בלחיצה. הנתונים מהסריקה של המנהל בגיליון; הדשבורד רק סופר.
 */
export function InsightsSection({ insights, generatedAt, scope, filtered, open, toggle }: {
  insights: Insights;
  /** מתי נבנה קובץ הנתונים: חלק שנקרא לפני כן נשאר מרענון קודם */
  generatedAt: string;
  scope: Scope;
  /** סינון לפי מקור או תהליך פעיל */
  filtered: boolean;
  open: Record<string, boolean>;
  toggle: (id: string) => void;
}) {
  const { analysis, questions, inquiries, feedback } = insights;
  const last = lastScan(analysis?.rows ?? null);
  const none = !analysis && !questions && !inquiries && !feedback;
  // לשונית שהקריאה שלה נכשלה ברענון האחרון: נשארים הנתונים הקודמים, עם הזמן האמיתי שלהם
  const stale = [analysis, questions, inquiries, feedback].map((p) => p?.readAt).filter((t): t is string => !!t && t !== generatedAt).sort()[0] ?? null;
  return (
    <section className="insights" id="insights" aria-labelledby="insights-h">
      <div className="secthead">
        <h2 id="insights-h">
          תובנות שיחה{' '}
          <Info>
            מהסריקה של השיחות שרצה בלילה וכותבת לגיליון (&quot;ניתוח שיחות&quot;, &quot;פניות&quot;, &quot;משובים&quot;, &quot;שאלות לסוכן&quot;). הדשבורד לא מסווג ולא
            סורק, רק סופר. שיחות בדיקה לא נספרות בשום מקום כאן. הטווח לפי תאריך הכניסה של איש הקשר, ובפניות ומשובים לפי התאריך שלהם.
          </Info>
        </h2>
        <span className="muted">
          {last ? <>נסרק לאחרונה <bdi>{fmtDateTime(last)}</bdi></> : null}
          {startsBeforeData(scope.range) ? <>{last ? ' · ' : ''}מ-2/10 בלבד</> : null}
          {stale ? <> · חלק מהלשוניות נכונות ל-<bdi>{fmtDateTime(stale)}</bdi></> : null}
        </span>
      </div>
      {none ? <p className="empty">אין עדיין נתונים</p> : null}
      {!none && (
        <>
          <div className="foldgrid">
            <AbandonCard rows={analysis?.rows ?? null} scope={scope} open={!!open['i-why']} onToggle={() => toggle('i-why')} />
            <InquiryCard rows={inquiries?.rows ?? null} scope={scope} open={!!open['i-inq']} onToggle={() => toggle('i-inq')} />
            <FeedbackCard rows={feedback?.rows ?? null} scope={scope} open={!!open['i-fb']} onToggle={() => toggle('i-fb')} />
            <QuestionCard insights={insights} scope={scope} filtered={filtered} open={!!open['i-q']} onToggle={() => toggle('i-q')} />
            {analysis ? <Removals rows={analysis.rows} scope={scope} open={!!open['i-rm']} onToggle={() => toggle('i-rm')} /> : null}
          </div>
        </>
      )}
    </section>
  );
}

function Empty() {
  return <p className="empty">אין עדיין נתונים</p>;
}

// ---------- למה נטשו ----------

const ALL_PATHS = 'all';

function AbandonCard({ rows, scope, open, onToggle }: { rows: AnalysisRow[] | null; scope: Scope; open: boolean; onToggle: () => void }) {
  const [path, setPath] = useState<string>(ALL_PATHS);
  const [showSteps, setShowSteps] = useState(false);
  const note = useLinkNote();
  const v = useMemo(() => (rows ? abandonView(rows, scope, path === ALL_PATHS ? null : path) : null), [rows, scope, path]);
  // הכותרת תמיד לפי כל המסלולים
  const head = useMemo(() => (rows ? abandonView(rows, scope, null) : null), [rows, scope]);
  const top = head?.reasons[0];
  return (
    <Fold
      id="i-why" level={3} className="icard" title="למה נטשו" open={open} onToggle={onToggle}
      big={head ? nf.format(head.abandoned) : '-'}
      seg={head?.reasons.map((r) => r.count)}
      sentence={head ? <>ניהלו שיחה ולא קנו{top ? <> · הסיבה המובילה: {top.name} ({pct(top.count, head.abandoned)})</> : null}</> : 'אין עדיין נתונים'}
    >
      {!v ? <Empty /> : (
        <>
          <div className="cardhead">
            <Chips value={path} onChange={setPath} label="מסלול" options={[{ id: ALL_PATHS, label: 'הכול' }, ...PATHS.map((p) => ({ id: p, label: p }))]} />
          </div>
          <div className="whyring">
            <Ring value={v.bought + v.abandoned ? v.bought / (v.bought + v.abandoned) : null} size={64} label="קנו מתוך מי שניהל שיחה" />
            <p>
              מתוך מי שניהל שיחה: <b>{nf.format(v.bought)}</b> קנו, <b>{nf.format(v.abandoned)}</b> לא{' '}
              <Info>
                ניהלו שיחה ולא קנו: &quot;קנה&quot; = לא, והסיבה היא לא &quot;לא כתב לבוט&quot;, &quot;הודעה בודדת בלבד&quot;, &quot;רכש בלי שיחה&quot;, &quot;אין נטישה - רכש&quot; או
                &quot;לא ברור מהסיכום&quot;. ניהלו שיחה וקנו: &quot;קנה&quot; = כן והסיבה &quot;אין נטישה - רכש&quot;. כאן אין משפך מליד לרכישה: רוב הקונים קנו בלי שיחה.
              </Info>
            </p>
          </div>
          <div className="two">
            <div>
              <h3>איפה נעצרו <Info>השלב האחרון של כל מי שלא קנה, כולל מי שלא ניהל שיחה. לחיצה על &quot;התחיל שאלון&quot; מפרטת לפי מספר השלב.</Info></h3>
              <BarList
                items={v.stops.map((s) => ({ name: s.name, count: s.count }))} color="--notbot"
                onSelect={(n) => n === STARTED_Q && setShowSteps(!showSteps)} selected={showSteps ? STARTED_Q : null}
              />
              {showSteps && v.stepN.length > 0 ? (
                <div className="substeps">
                  <BarList items={v.stepN} color="--notbot" max={12} />
                </div>
              ) : null}
            </div>
            <div>
              <h3>למה נטשו <Info>רק מי שניהל שיחה ולא קנה, לפי &quot;סיבת נטישה&quot;. האחוז מתוך כל הנטושים במסלול שנבחר.</Info></h3>
              <BarList
                items={v.reasons.map((r) => ({ name: r.name, count: r.count }))} color="--bot"
                extra={(n) => pct(v.reasons.find((r) => r.name === n)?.count ?? 0, v.abandoned)}
                colorOf={(n) => (n === BOT_FAILURE ? '--series-2' : undefined)}
                tagOf={(n) => (n === BOT_FAILURE ? 'דורש תיקון בבוט' : null)}
              />
            </div>
          </div>
          <p className="muted small">
            בלי שיחה: {v.noConversation.map((x) => `${x.name} ${nf.format(x.count)}`).join(' · ')}
            {v.pending ? ` · בבדיקה: ${nf.format(v.pending)}` : ''}
          </p>
          <ListBlock
            note={note}
            items={v.reasons.map((r) => ({ id: `why-${r.name}`, title: r.name, count: `${nf.format(r.count)} אנשים`, render: () => <AnalysisList rows={r.rows} /> }))}
          />
        </>
      )}
    </Fold>
  );
}

// ---------- פניות שירות ----------

function InquiryCard({ rows, scope, open, onToggle }: { rows: InquiryRow[] | null; scope: Scope; open: boolean; onToggle: () => void }) {
  const note = useLinkNote();
  const v = useMemo(() => (rows ? inquiryView(rows, scope) : null), [rows, scope]);
  const top = v?.cats.find((c) => c.name !== OTHER) ?? v?.cats[0];
  return (
    <Fold
      id="i-inq" level={3} className="icard" title="פניות שירות" open={open} onToggle={onToggle}
      big={v ? nf.format(v.categorized) : '-'}
      seg={v?.cats.map((c) => c.count)}
      sentence={v ? <>פניות{top ? <> · הנושא המוביל: {top.name} ({pctOf(top.share)})</> : null}</> : 'אין עדיין נתונים'}
    >
      {!v ? <Empty /> : (
        <>
          <h3>
            לפי נושא{' '}
            <Info>
              כל שורה בלשונית &quot;פניות&quot; היא פנייה, מ-2/10. אדם אחד יכול לפנות כמה פעמים ובכמה נושאים. נושא עם פחות מ-5 פניות בטווח שבחרת נכנס ל&quot;אחר&quot;.
              האחוז מתוך הפניות המסווגות.
            </Info>
          </h3>
          <BarList
            items={v.cats.map((c) => ({ name: c.name, count: c.count }))} color="--bot"
            extra={(n) => { const c = v.cats.find((x) => x.name === n); return c ? `${nf.format(c.people)} אנשים · ${pctOf(c.share)}` : null; }}
          />
          {v.pending ? <p className="muted small">{nf.format(v.pending)} עוד בסיווג</p> : null}
          {v.top3.length > 0 ? (
            <>
              <h3>לפי שבוע <Info>שלושת הנושאים הגדולים בטווח, כל אחד בגרף משלו ובאותו סולם, כדי שלא יהיו צבעים נוספים.</Info></h3>
              <div className="trends">
                {v.top3.map((name, k) => (
                  <div key={name} className="trend">
                    <span className="trendname" title={name}>{name}</span>
                    <Sparkline
                      labels={v.weekly.map((d) => fmtBucket(d.key, 'week'))} values={v.weekly.map((d) => d.values[k])} color="--bot" height={28}
                      max={Math.max(1, ...v.weekly.flatMap((d) => d.values.slice(0, v.top3.length)))} label={`${name} לפי שבוע`}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <ListBlock
            note={note}
            items={v.cats.map((c) => ({ id: `inq-${c.name}`, title: c.name, count: `${nf.format(c.count)} פניות`, render: () => <TextList kind="inquiry" rows={c.rows} head="תוכן הפנייה" /> }))}
          />
        </>
      )}
    </Fold>
  );
}

// ---------- משובים אחרי מבחן ----------

function FeedbackCard({ rows, scope, open, onToggle }: { rows: FeedbackRow[] | null; scope: Scope; open: boolean; onToggle: () => void }) {
  const [exam, setExam] = useState<ExamFilter>('all');
  const note = useLinkNote();
  const v = useMemo(() => (rows ? feedbackView(rows, scope, exam) : null), [rows, scope, exam]);
  const head = useMemo(() => (rows ? feedbackView(rows, scope, 'all') : null), [rows, scope]);
  return (
    <Fold
      id="i-fb" level={3} className="icard" title="משובים אחרי מבחן" open={open} onToggle={onToggle}
      big={head ? nf.format(head.categorized) : '-'}
      seg={head?.cats.map((c) => c.count)}
      sentence={head ? <>משובים{head.cats[0] ? <> · המוביל: {head.cats[0].name}</> : null}</> : 'אין עדיין נתונים'}
    >
      {!v ? <Empty /> : (
        <>
          <div className="cardhead">
            <h3>לפי נושא <Info>&quot;קטגוריה&quot; בלשונית &quot;משובים&quot;, מ-2/10. עבר / לא עבר לפי העמודה &quot;מבחן&quot;.</Info></h3>
            <Chips value={exam} onChange={setExam} label="מבחן" options={[{ id: 'all', label: 'הכול' }, { id: 'passed', label: 'עבר' }, { id: 'failed', label: 'לא עבר' }]} />
          </div>
          <BarList items={v.cats.map((c) => ({ name: c.name, count: c.count }))} color="--bot" extra={(n) => pctOf(v.cats.find((c) => c.name === n)?.share ?? null)} />
          {v.pending ? <p className="muted small">{nf.format(v.pending)} עוד בסיווג</p> : null}
          <ListBlock
            note={note}
            items={v.cats.map((c) => ({ id: `fb-${c.name}`, title: c.name, count: `${nf.format(c.count)} משובים`, render: () => <TextList kind="feedback" rows={c.rows} head="המשוב" /> }))}
          />
        </>
      )}
    </Fold>
  );
}

// ---------- שאלות ליקיר ----------

function QuestionCard({ insights, scope, filtered, open, onToggle }: { insights: Insights; scope: Scope; filtered: boolean; open: boolean; onToggle: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const { examples, questionsUrl } = useAuth();
  const rows = insights.questions?.rows ?? null;
  const v = useMemo(() => (rows ? questionView(rows, scope.range, showAll) : null), [rows, scope.range, showAll]);
  const sample = sampleSize(insights.analysis?.rows ?? null);
  const sampleText = sample ? `לפי מדגם של כ-${nf.format(sample)} שיחות` : 'לפי מדגם';
  return (
    <Fold
      id="i-q" level={3} className="icard" title="שאלות ליקיר" open={open} onToggle={onToggle}
      big={v ? nf.format(v.all.length) : '-'}
      seg={v ? [v.answered, v.waiting] : undefined}
      sentence={v ? <>שאלות · {nf.format(v.waiting)} ממתינות לתשובה · {sampleText}</> : 'אין עדיין נתונים'}
    >
      {!v ? <Empty /> : (
        <>
          <div className="cardhead">
            <h3>
              מה הסוכן לא ידע לענות{' '}
              <Info>
                {sampleText}: המופעים נספרים רק מהצ&apos;אטים שהסריקה קראה, ולא מכל השיחות. קונים לא נקראו. יקיר עונה בלשונית &quot;שאלות לסוכן&quot; בגיליון, והתשובה
                מוצגת כאן לקריאה בלבד. הטווח לפי &quot;נשאל לאחרונה&quot;.{filtered ? ' הכרטיס הזה לא מסונן לפי מקור ותהליך.' : ''}
              </Info>
            </h3>
            <Chips value={showAll ? 'all' : 'two'} onChange={(x) => setShowAll(x === 'all')} label="אילו שאלות" options={[{ id: 'two', label: 'פעמיים ומעלה' }, { id: 'all', label: 'להציג הכול' }]} />
          </div>
          <Bars100
            label="ענו"
            parts={[
              { value: v.answered, color: '--bot', text: nf.format(v.answered), more: `מתוך ${nf.format(v.all.length)}` },
              { value: v.waiting, color: '--open-a', text: nf.format(v.waiting), more: 'ממתינות' },
            ]}
          />
          {filtered ? <p className="muted small">לא מסונן לפי מקור ותהליך</p> : null}
          {questionsUrl ? <p className="small"><a href={questionsUrl} target="_blank" rel="noopener noreferrer">לענות בגיליון, בלשונית &quot;שאלות לסוכן&quot; ↗</a></p> : null}
          {v.shown.length === 0 ? <p className="empty">אין שאלות שהופיעו פעמיים ומעלה בטווח הזה</p> : (
            <ListBlock
              title="פירוט"
              items={[{
                id: 'questions', title: 'השאלות', count: `${nf.format(v.shown.length)} שאלות`,
                render: () => (
                  <MoreTable
                    headers={['שאלה', 'קטגוריה', 'מופעים', 'נשאל לאחרונה', 'סטטוס', 'תשובת יקיר', 'שיחות']}
                    rows={v.shown.map(({ r, i }) => ({
                      key: `q-${i}`,
                      cells: [
                        <span key="t" className="qtext">{r.text}</span>, r.category ?? '-', nf.format(r.count), r.lastAt ? fmtDate(r.lastAt) : '-', r.status ?? '-',
                        r.answer ? <span key="a" className="qtext">{r.answer}</span> : '-',
                        <span key="e" className="exlinks">{examples(i).map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{k + 1}↗</a>)}</span>,
                      ],
                    }))}
                  />
                ),
              }]}
            />
          )}
        </>
      )}
    </Fold>
  );
}

// ---------- הסירו את עצמם ----------

function Removals({ rows, scope, open, onToggle }: { rows: AnalysisRow[]; scope: Scope; open: boolean; onToggle: () => void }) {
  const v = useMemo(() => removalView(rows, scope), [rows, scope]);
  return (
    <Fold
      id="i-rm" level={3} className="icard" title="הסירו את עצמם" open={open} onToggle={onToggle}
      big={nf.format(v.count)}
      seg={v.reasons.map((r) => r.count)}
      sentence={v.reasons[0] ? <>המוביל: {v.reasons[0].name}</> : 'אין הסרות בטווח הזה'}
    >
      <BarList items={v.reasons} color="--bot" />
    </Fold>
  );
}

// ---------- רשימות ----------

/** רשימת אנשים מ"ניתוח שיחות": תאריך, שם, מסלול, שלב, הפירוט הקצר וקישור לשיחה. השם והפירוט מהקובץ הפרטי */
export function AnalysisList({ rows }: { rows: Indexed<AnalysisRow>[] }) {
  const { name, text } = useAuth();
  const sorted = [...rows].sort((a, b) => (b.r.at ?? '').localeCompare(a.r.at ?? ''));
  return (
    <MoreTable
      headers={['תאריך', 'שם', 'מסלול', 'שלב', 'פירוט', '']}
      rows={sorted.map(({ r, i }) => ({
        key: `a-${i}`,
        cells: [r.at ? fmtDate(r.at) : '-', name('analysis', i) || '-', r.path ?? '-', r.step ?? '-', <span key="d" className="cliptext">{text('analysis', i) || '-'}</span>, <ChatLink key="l" kind="analysis" i={i} />],
      }))}
    />
  );
}

/** רשימת פניות או משובים: תאריך, שם, התוכן וקישור לשיחה */
function TextList({ kind, rows, head }: { kind: Exclude<RowKind, 'analysis'>; rows: Indexed<InquiryRow | FeedbackRow>[]; head: string }) {
  const { name, text } = useAuth();
  const sorted = [...rows].sort((a, b) => (b.r.at ?? '').localeCompare(a.r.at ?? ''));
  return (
    <MoreTable
      headers={['תאריך', 'שם', head, '']}
      rows={sorted.map(({ r, i }) => ({
        key: `${kind}-${i}`,
        cells: [r.at ? fmtDate(r.at) : '-', name(kind, i) || '-', <span key="t" className="cliptext" title={text(kind, i)}>{text(kind, i) || '-'}</span>, <ChatLink key="l" kind={kind} i={i} />],
      }))}
    />
  );
}
