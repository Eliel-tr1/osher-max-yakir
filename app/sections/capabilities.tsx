'use client';

import type { ReactNode } from 'react';
import type { Capability, CapabilityId } from '@/lib/metrics';
import { Info, Sparkline, money, nf } from '../charts';
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
  { id: 'links', name: 'קישורי רכישה ולאתר', unit: 'רכישות אחרי קישור מהבוט', target: 'buys' },
  { id: 'mail', name: 'דיוורים', unit: 'רכישות של נמענים', target: 'mail' },
  { id: 'popup', name: 'הפופאפ', unit: 'שיחות אמיתיות מהפופאפ', target: 'popup' },
];

/**
 * "מה הבוט עושה" (הנחיית המנהל 3/11/2026, #27): חמישה כרטיסי יכולת בשורה. בכל כרטיס מספר גדול אחד, € שהביא וגרף שבועי.
 * לחיצה פותחת את הפירוט שלו למטה.
 */
export function Capabilities({ caps, onOpen }: { caps: Record<CapabilityId, Capability>; onOpen: (id: CapabilityId, target: string) => void }) {
  return (
    <section className="caps" aria-labelledby="caps-h">
      <h2 id="caps-h" className="capshead">
        מה הבוט עושה{' '}
        <Info>
          שיחות מכירה: אנשים שהסוכן סימן אצלם שיחה מכירתית, וה-€ של רכישות הבוט עם הסיבה &quot;שיחה מכירתית לפני הרכישה&quot;. קופונים: קופונים שהבוט הפיק בטווח,
          וה-€ של רכישות הבוט עם הסיבה &quot;קופון הבוט&quot;. קישורים: רכישות הבוט עם &quot;הבוט שלח קופון או קישור רכישה&quot; או &quot;הבוט שלח קישור לאתר&quot;. שלושת
          אלה חלקים נפרדים מה-€ של הבוט. דיוורים: רכישות של נמענים עד 72 שעות אחרי השליחה, מכל הקמפיינים. הפופאפ: שיחות אמיתיות של מי שנכנס מהפופאפ, וה-€ של
          רכישות הבוט שלהם אחרי הכניסה. הדיוורים והפופאפ נמדדים אחרת ויכולים לחפוף לשלושת הראשונים (בדיוורים נספרות גם רכישות שלא סומנו של הבוט), ולכן הסכום של
          חמשת הכרטיסים יכול להיות גדול מה-€ של הבוט.
        </Info>
      </h2>
      <div className="caprow">
        {CAPABILITIES.map((c) => {
          const x = caps[c.id];
          return (
            <div key={c.id} className="cap">
              <span className="capname">
                <svg className="capicon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[c.id]}</svg>
                {c.name}
              </span>
              <span className="capnum">{nf.format(x.count)}</span>
              <span className="capunit">{c.unit}</span>
              <span className="capmoney">{money.format(x.paid)}</span>
              <Sparkline labels={x.weekly.map((d) => fmtBucket(d.key, 'week'))} values={x.weekly.map((d) => d.values[0])} color="--bot" height={26} label={`${c.name} לפי שבוע`} />
              {/* כל הכרטיס לחיץ: כפתור שקוף מעליו, כי בתוך כפתור אי אפשר לשים את הגרף */}
              <button type="button" className="capbtn" onClick={() => onOpen(c.id, c.target)} aria-label={`${c.name}: ${nf.format(x.count)} ${c.unit}, ${money.format(x.paid)}. לפירוט`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
