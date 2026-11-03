'use client';

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BASE_PATH } from '@/lib/app';

/**
 * כניסה בסיסמה לרשימות עם קישורים לשיחות ב-CloudChat (#6, הנחיית המנהל 1/11/2026: סיסמה אחת, בלי Google).
 * הקודים המזהים לא בקובץ הציבורי: הם מגיעים מ-links.php רק אחרי כניסה, ורק כשהם מאותו רענון כמו הנתונים.
 */
export const CHAT_URL = 'https://console.thecloud.chat/inbox/';

interface PrivateRows {
  ns: string[];
  names: string[];
  texts: string[];
}

interface Ids {
  generatedAt: string;
  leads: string[];
  purchases: string[];
  mailings: string[];
  /** תובנות שיחה (3/11/2026): קוד מזהה, שם וטקסט חופשי לכל שורה */
  analysis?: PrivateRows | null;
  inquiries?: PrivateRows | null;
  feedback?: PrivateRows | null;
  questions?: string[][] | null;
  /** קישור ללשונית "שאלות לסוכן" בגיליון, רק אחרי כניסה */
  questionsUrl?: string | null;
}

type Status = 'loading' | 'off' | 'out' | 'in';
export type LinkKind = 'lead' | 'purchase' | 'mailing' | 'analysis' | 'inquiry' | 'feedback';
/** שורות של תובנות השיחה, שיש להן שם וטקסט בקובץ הפרטי */
export type RowKind = 'analysis' | 'inquiry' | 'feedback';

interface Auth {
  status: Status;
  /** הקודים מרענון אחר מהנתונים שבדף */
  stale: boolean;
  link: (kind: LinkKind, i: number | undefined) => string | null;
  /** שם וטקסט חופשי לשורה של תובנות השיחה. '' = אין */
  name: (kind: RowKind, i: number) => string;
  text: (kind: RowKind, i: number) => string;
  /** קישורים לשיחות לדוגמה של שאלה */
  examples: (i: number) => string[];
  questionsUrl: string | null;
  signIn: (password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<Auth>({
  status: 'off', stale: false, link: () => null, name: () => '', text: () => '', examples: () => [], questionsUrl: null, signIn: async () => false, signOut: async () => {}, error: null,
});

export function useAuth(): Auth {
  return useContext(AuthContext);
}

export function AuthProvider({ generatedAt, children }: { generatedAt: string; children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
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
      .then((a: { configured?: boolean; in?: boolean } | null) => {
        if (!alive) return;
        if (!a?.configured) return setStatus('off');
        setStatus(a.in ? 'in' : 'out');
        if (a.in) loadIds().catch(() => setIds(null));
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

  const signIn = useCallback(async (password: string) => {
    setError(null);
    const res = await fetch(`${BASE_PATH}/auth.php`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null);
    const body = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string };
    if (!res || !res.ok || !body.ok) {
      setError(body.error ?? 'הכניסה נכשלה');
      return false;
    }
    setStatus('in');
    await loadIds().catch(() => setIds(null));
    return true;
  }, [loadIds]);

  const signOut = useCallback(async () => {
    await fetch(`${BASE_PATH}/auth.php`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logout: true }) }).catch(() => null);
    setIds(null);
    setStatus('out');
  }, []);

  const fresh = ids !== null && ids.generatedAt === generatedAt;
  const rowsOf = useCallback(
    (kind: RowKind): PrivateRows | null => (!fresh || !ids ? null : (kind === 'analysis' ? ids.analysis : kind === 'inquiry' ? ids.inquiries : ids.feedback) ?? null),
    [fresh, ids],
  );
  const link = useCallback(
    (kind: LinkKind, i: number | undefined) => {
      if (!fresh || i === undefined || !ids) return null;
      const list = kind === 'lead' ? ids.leads : kind === 'purchase' ? ids.purchases : kind === 'mailing' ? ids.mailings : rowsOf(kind)?.ns;
      const ns = list?.[i];
      return ns ? `${CHAT_URL}${encodeURIComponent(ns)}` : null;
    },
    [fresh, ids, rowsOf],
  );
  const name = useCallback((kind: RowKind, i: number) => rowsOf(kind)?.names[i] ?? '', [rowsOf]);
  const text = useCallback((kind: RowKind, i: number) => rowsOf(kind)?.texts[i] ?? '', [rowsOf]);
  const examples = useCallback(
    (i: number) => (fresh && ids?.questions?.[i] ? ids.questions[i].map((ns) => `${CHAT_URL}${encodeURIComponent(ns)}`) : []),
    [fresh, ids],
  );

  return (
    <AuthContext.Provider value={{ status, stale: status === 'in' && ids !== null && !fresh, link, name, text, examples, questionsUrl: ids?.questionsUrl ?? null, signIn, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
}

/** בראש הדף: כפתור "כניסה" שפותח שדה סיסמה, או "מחובר" וכפתור יציאה. כשהכניסה לא הוגדרה, לא מופיע כלום */
export function LoginControl() {
  const { status, signIn, signOut, error } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (status === 'off' || status === 'loading') return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    const ok = await signIn(password);
    setBusy(false);
    setPassword('');
    if (ok) setOpen(false);
  };
  return (
    <div className="login">
      {status === 'in' ? (
        <>
          <span className="who">מחובר</span>
          <button type="button" className="linkbtn" onClick={() => signOut().then(() => window.location.reload())}>יציאה</button>
        </>
      ) : open ? (
        <form className="pwform" onSubmit={submit}>
          <input type="password" autoComplete="current-password" aria-label="סיסמה" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <button type="submit" disabled={busy || !password}>{busy ? '...' : 'כניסה'}</button>
        </form>
      ) : (
        <button type="button" className="linkbtn" onClick={() => setOpen(true)}>כניסה לקישורים לשיחות</button>
      )}
      {error ? <span className="err" role="alert">{error}</span> : null}
    </div>
  );
}

/** מסך הכניסה: כל הדשבורד מאחורי סיסמה (הנחיית המנהל, 1/11/2026) */
export function LoginGate({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`${BASE_PATH}/auth.php`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null);
    const body = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; error?: string };
    setBusy(false);
    setPassword('');
    if (res?.ok && body.ok) onIn();
    else setError(body.error ?? 'הכניסה נכשלה');
  };
  return (
    <main className="page gate">
      <form className="gatebox" onSubmit={submit}>
        <h1>דשבורד אושר מקס</h1>
        <label htmlFor="gate-pw">סיסמה</label>
        <input id="gate-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <button type="submit" disabled={busy || !password}>{busy ? 'בודק...' : 'כניסה'}</button>
        {error ? <p className="err" role="alert">{error}</p> : null}
      </form>
    </main>
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
