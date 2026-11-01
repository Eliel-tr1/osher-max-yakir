'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BASE_PATH } from '@/lib/app';

/**
 * כניסה עם Google לרשימות עם קישורים לשיחות ב-CloudChat (#6, הנחיית המנהל 1/11/2026).
 * הקודים המזהים לא בקובץ הציבורי: הם מגיעים מ-links.php רק אחרי כניסה, ורק כשהם מאותו רענון כמו הנתונים.
 */
export const CHAT_URL = 'https://console.thecloud.chat/inbox/';

interface Ids {
  generatedAt: string;
  leads: string[];
  purchases: string[];
  mailings: string[];
}

type Status = 'loading' | 'off' | 'out' | 'in';
export type LinkKind = 'lead' | 'purchase' | 'mailing';

interface Auth {
  status: Status;
  email: string | null;
  clientId: string | null;
  /** הקודים מרענון אחר מהנתונים שבדף */
  stale: boolean;
  link: (kind: LinkKind, i: number | undefined) => string | null;
  signIn: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<Auth>({
  status: 'off', email: null, clientId: null, stale: false, link: () => null, signIn: async () => {}, signOut: async () => {}, error: null,
});

export function useAuth(): Auth {
  return useContext(AuthContext);
}

export function AuthProvider({ generatedAt, children }: { generatedAt: string; children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [ids, setIds] = useState<Ids | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIds = useCallback(async () => {
    const res = await fetch(`${BASE_PATH}/links.php?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    setIds(res.ok ? ((await res.json()) as Ids) : null);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE_PATH}/auth.php`, { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: { configured?: boolean; clientId?: string | null; email?: string | null } | null) => {
        if (!alive) return;
        if (!a?.configured) return setStatus('off');
        setClientId(a.clientId ?? null);
        setEmail(a.email ?? null);
        setStatus(a.email ? 'in' : 'out');
        if (a.email) loadIds().catch(() => setIds(null));
      })
      .catch(() => alive && setStatus('off'));
    return () => {
      alive = false;
    };
  }, [loadIds]);

  // נתונים חדשים (רענון): גם הקודים מתעדכנים
  useEffect(() => {
    if (status === 'in') loadIds().catch(() => setIds(null));
  }, [generatedAt, status, loadIds]);

  const signIn = useCallback(async (credential: string) => {
    setError(null);
    const res = await fetch(`${BASE_PATH}/auth.php`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string };
    if (!res.ok || !body.ok) {
      setError(body.error ?? 'הכניסה נכשלה');
      return;
    }
    setEmail(body.email ?? null);
    setStatus('in');
    await loadIds();
  }, [loadIds]);

  const signOut = useCallback(async () => {
    await fetch(`${BASE_PATH}/auth.php`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logout: true }) }).catch(() => null);
    setEmail(null);
    setIds(null);
    setStatus('out');
  }, []);

  const fresh = ids !== null && ids.generatedAt === generatedAt;
  const link = useCallback(
    (kind: LinkKind, i: number | undefined) => {
      if (!fresh || i === undefined || !ids) return null;
      const ns = (kind === 'lead' ? ids.leads : kind === 'purchase' ? ids.purchases : ids.mailings)[i];
      return ns ? `${CHAT_URL}${encodeURIComponent(ns)}` : null;
    },
    [fresh, ids],
  );

  return (
    <AuthContext.Provider value={{ status, email, clientId, stale: status === 'in' && ids !== null && !fresh, link, signIn, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
}

interface GoogleId {
  accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } };
}

/** בראש הדף: כפתור "התחברות עם Google", או המייל וכפתור יציאה. כשהכניסה לא הוגדרה, לא מופיע כלום */
export function LoginControl() {
  const { status, email, clientId, signIn, signOut, error } = useAuth();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== 'out' || !clientId || !box.current) return;
    const el = box.current;
    const render = () => {
      const g = (window as unknown as { google?: GoogleId }).google;
      if (!g) return;
      g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => signIn(r.credential), ux_mode: 'popup', auto_select: false });
      g.accounts.id.renderButton(el, { theme: 'outline', size: 'medium', text: 'signin_with', locale: 'he', shape: 'pill' });
    };
    if ((window as unknown as { google?: GoogleId }).google) return render();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [status, clientId, signIn]);
  if (status === 'off' || status === 'loading') return null;
  return (
    <div className="login">
      {status === 'in' ? (
        <>
          <span className="who" dir="ltr">{email}</span>
          <button type="button" className="linkbtn" onClick={signOut}>יציאה</button>
        </>
      ) : (
        <div ref={box} aria-label="התחברות עם Google" />
      )}
      {error ? <span className="err" role="alert">{error}</span> : null}
    </div>
  );
}

/** כפתור קטן "לשיחה ↗" בשורה של רשימה, רק למי שמחובר */
export function ChatLink({ kind, i }: { kind: LinkKind; i: number | undefined }) {
  const { link } = useAuth();
  const url = link(kind, i);
  if (!url) return null;
  return <a className="chatlink" href={url} target="_blank" rel="noopener noreferrer">לשיחה ↗</a>;
}

/** הכיתוב ליד כותרת הרשימות: מה צריך כדי לראות קישורים */
export function useLinkNote(): string | null {
  const { status, stale } = useAuth();
  if (status === 'out') return 'התחבר כדי לראות קישורים';
  if (status === 'off') return 'קישורים לשיחות: אחרי הגדרת הכניסה';
  if (stale) return 'הקישורים יתעדכנו אחרי רענון';
  return null;
}
