'use client';

import { useState, type ReactNode } from 'react';
import type { Capability, CapabilityId } from '@/lib/metrics';
import { Chev, Info, Sparkline, Trend, money, nf } from '../charts';
import { fmtBucket } from './shared';

/** אייקונים קטנים בצבע אחד (הצבע של הבוט), בלי צבעים נוספים בכרטיסי היכולת */
const ICONS: Record<CapabilityId, ReactNode> = {
  sales: <path d="M4 5h16v10H10l-5 4v-4H4z" />,
  coupons: <><path d="M3 9a2 2 0 0 0 0-4h18a2 2 0 0 0 0 4v6a2 2 0 0 0 0 4H3a2 2 0 0 0 0-4z" /><path d="M9 9l6 6M9.5 14.5h.01M14.5 9.5h.01" /></>,
  links: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  mail: <><path d="M3 6h18v12H3z" /><path d="M3 7l9 6 9-6" /></>,
  popup: <><path d="M3 5h18v14H3z" /><path d="M3 9h18M14 12h4v4h-4z" /></>,
};

/** שם, יחידה, ולאן הלחיצה מובילה */
export const CAPABILITIES: { id: CapabilityId; name: string; unit: string; target: string }[] = [
  { id: 'sales', name: 'שיחות מכירה', unit: 'אנשים עם שיחה מכירתית', target: 'buys' },
  { id: 'coupons', name: 'קופונים אישיים', unit: 'קופונים שהבוט הפיק', target: 'coupons' },
  { id: 'links', name: 'טמפלייטים וקישורים', unit: 'רכישות אחרי טמפלייט או קישור מהבוט', target: 'buys' },
  { id: 'mail', name: 'דיוורים', unit: 'רכישות של נמענים', target: 'mail' },
  { id: 'popup', name: 'הפופאפ', unit: 'שיחות אמיתיות מהפופאפ', target: 'popup' },
];

/**
 * "מה הבוט עושה" (עיצוב א4, #34): שורה לכל יכולת, עם הכמות, ה-€ והמגמה. לחיצה פותחת את הגרף השבועי,
 * ומשם אפשר לעבור לפירוט המלא למטה.
 */
export function Capabilities({ caps, onOpen }: { caps: Record<CapabilityId, Capability>; onOpen: (id: CapabilityId, target: string) => void }) {
  const [open, setOpen] = useState<CapabilityId | null>(null);
  return (
    <section className="card caps" aria-labelledby="caps-h">
      <h2 id="caps-h" className="capshead">
        מה הבוט עושה{' '}
        <Info>
          מ-11/11/2026 כל החלונות הם 24 שעות לפני הרכישה. שיחות מכירה: אנשים שהסוכן סימן אצלם שיחה מכירתית, וה-€ של רכישות הבוט עם הסיבה &quot;שיחה מכירתית עד 24 שעות
          לפני הרכישה&quot;. קופונים: קופונים שהבוט הפיק בטווח, וה-€ של רכישות הבוט עם הסיבה &quot;קופון הבוט&quot;. טמפלייטים וקישורים: רכישות הבוט עד 24 שעות אחרי טמפלייט
          שיווקי, או אחרי טמפלייט מבחן שהלקוח המשיך אחריו לשיחה עם הבוט (וגם הנוסח הקודם, קישור רכישה או קישור לאתר מהבוט). שלושת
          אלה חלקים נפרדים מה-€ של הבוט. דיוורים: רכישות של נמענים עד 72 שעות אחרי השליחה, מכל הקמפיינים; כולן מסומנות בגיליון &quot;של הבוט&quot; = כן. הפופאפ:
          שיחות אמיתיות של מי שנכנס מהפופאפ, וה-€ של רכישות הבוט שלהם אחרי הכניסה. הדיוורים והפופאפ חופפים לשיחות המכירה: רכישה של נמען, או של מי שנכנס מהפופאפ,
          יכולה להיות גם רכישה אחרי שיחה מכירתית, ואז היא נספרת בשני כרטיסים. לכן הסכום של חמשת הכרטיסים יכול להיות גדול מה-€ של הבוט.
        </Info>
      </h2>
      {CAPABILITIES.map((c) => {
        const x = caps[c.id];
        const isOpen = open === c.id;
        const panel = `cap-${c.id}`;
        return (
          <div key={c.id} className={`cap${isOpen ? ' open' : ''}`}>
            <button type="button" className="capbtn" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? null : c.id)}>
              <span className="capname">
                <svg className="capicon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[c.id]}</svg>
                {c.name}
              </span>
              <span className="capcount"><b>{nf.format(x.count)}</b> {c.unit}</span>
              <span className="capmoney">{money.format(x.paid)}</span>
              <span className="captrend">
                <Trend values={x.weekly.map((d) => d.values[0])} color="--bot" />
                <Chev />
              </span>
            </button>
            {isOpen ? (
              <div className="cappanel" id={panel}>
                <Sparkline labels={x.weekly.map((d) => fmtBucket(d.key, 'week'))} values={x.weekly.map((d) => d.values[0])} color="--bot" height={60} label={`${c.name} לפי שבוע`} />
                <button type="button" className="linkbtn" onClick={() => onOpen(c.id, c.target)}>לפירוט המלא</button>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
