import { getLeads } from '@/lib/leads/source';
import { inRange, summarize } from '@/lib/metrics';

const nf = new Intl.NumberFormat('he-IL');
const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' });
const time = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

const DAYS = 30;

export default async function Home() {
  const { source, leads, fetchedAt } = await getLeads();
  const to = source === 'demo' && leads[0] ? new Date(leads[0].enteredAt.getTime() + 1) : fetchedAt;
  const from = new Date(to.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const s = summarize(inRange(leads, { from, to }));

  const tiles = [
    { label: 'לידים שנכנסו', value: nf.format(s.leads), sub: `ב-${DAYS} הימים האחרונים` },
    { label: "ענו לצ'אטבוט", value: nf.format(s.answered), sub: s.answeredRate === null ? '-' : `${pct.format(s.answeredRate)} מהלידים` },
    { label: 'סיימו שאלון', value: nf.format(s.finishedQuestionnaire), sub: 'כולל מי שהגיע לתשלום' },
    { label: 'שילמו', value: nf.format(s.paid), sub: `${money.format(s.revenue)} נכנסו` },
  ];

  return (
    <main className="page">
      <header className="head">
        <h1>דשבורד אושר מקס</h1>
        <span className="period">
          {day.format(from)} - {day.format(new Date(to.getTime() - 1))}
        </span>
      </header>

      {source === 'demo' && (
        <p className="notice" role="status">
          אלה נתוני הדגמה מומצאים. החיבור לטבלת הלידים האמיתית ייבנה בשלב הבא.
        </p>
      )}

      <section className="tiles" aria-label="מספרי מפתח">
        {tiles.map((t) => (
          <article className="tile" key={t.label}>
            <p className="label">{t.label}</p>
            <p className="value">{t.value}</p>
            <p className="sub">{t.sub}</p>
          </article>
        ))}
      </section>

      <section className="next">
        <h2>גרפים וחתכים</h2>
        <p>ייבנו אחרי שנחליט ביחד מה חשוב לראות: לפי יום, לפי סטטוס, לפי תהליך או משפך.</p>
      </section>

      <footer className="foot">
        עודכן {day.format(fetchedAt)} בשעה {time.format(fetchedAt)}
      </footer>
    </main>
  );
}
