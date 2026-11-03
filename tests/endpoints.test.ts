import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * השערים של השרת, דרך שרת PHP אמיתי (php -S): הרענון האוטומטי רק בשורת הפקודה, הכפתור רק למי שנכנס,
 * והנתונים רק אחרי כניסה (הנחיית המנהל 3/11/2026).
 */
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!php)('server gates', () => {
  const port = 4300 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), 'gates-'));
  // הסוד של גישת הקריאה (#28): אקראי לכל ריצה. בשרת רק הגיבוב, כמו שהפריסה כותבת
  const READ = randomBytes(24).toString('base64url');
  let server: ChildProcess;

  beforeAll(async () => {
    writeFileSync(join(dir, 'auth.json'), JSON.stringify({ salt: 's', iter: 20000, hash: 'ab' }));
    writeFileSync(join(dir, 'leads.json'), '{"version":2,"generatedAt":"2026-11-03T04:30:00.000Z","sheetRows":1,"leads":[],"purchases":[]}');
    const salt = randomBytes(16).toString('hex');
    writeFileSync(join(dir, 'read-token.json'), JSON.stringify({ salt, iter: 20000, hash: pbkdf2Sync(READ, salt, 20000, 32, 'sha256').toString('hex') }));
    server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public'], { env: { ...process.env, OSHER_PRIVATE_DIR: dir }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(`${base}/refresh.php`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
  afterAll(() => {
    server?.kill();
  });

  it('runs the daily refresh only from the command line, never from the web', async () => {
    const res = await fetch(`${base}/refresh-cron.php`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('lets only a logged in user press the refresh button, and shows only the time to others', async () => {
    expect((await fetch(`${base}/refresh.php`, { method: 'POST' })).status).toBe(401);
    expect(await (await fetch(`${base}/refresh.php`)).json()).toEqual({ ok: true, generatedAt: '2026-11-03T04:30:00.000Z', sheetRows: 1 });
  });

  it('gives the data only after login', async () => {
    expect((await fetch(`${base}/data.php`)).status).toBe(401);
    expect((await fetch(`${base}/links.php`)).status).toBe(401);
    expect((await fetch(`${base}/_refresh.php`)).status).not.toBe(500);
    // קריאת הגיליון עם חשבון שירות (#29): גישה ישירה לא עושה כלום ולא מחזירה כלום
    const gs = await fetch(`${base}/_gsheet.php`);
    expect(gs.status).not.toBe(500);
    expect(await gs.text()).toBe('');
  });

  it('gives the second agent the same data with the read secret in a header, and nothing else (#28)', async () => {
    const h = { 'X-Dashboard-Read-Token': READ };
    const res = await fetch(`${base}/data.php`, { headers: h });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.text()).toBe(readFileSync(join(dir, 'leads.json'), 'utf8'));
    // לא הקודים המזהים ולא רענון
    expect((await fetch(`${base}/links.php`, { headers: h })).status).toBe(401);
    expect((await fetch(`${base}/refresh.php`, { method: 'POST', headers: h })).status).toBe(401);
  });

  it('refuses a missing, empty or wrong read secret with 401, and blocks after 5 wrong tries (#28)', async () => {
    expect((await fetch(`${base}/data.php`)).status).toBe(401);
    expect((await fetch(`${base}/data.php`, { headers: { 'X-Dashboard-Read-Token': '' } })).status).toBe(401);
    const wrong = await fetch(`${base}/data.php`, { headers: { 'X-Dashboard-Read-Token': `${READ}x` } });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).not.toContain('leads');
    // עוד 5 שגויים מאותה כתובת: מעכשיו גם הסוד הנכון נחסם ל-15 דקות
    for (let i = 0; i < 5; i++) expect((await fetch(`${base}/data.php`, { headers: { 'X-Dashboard-Read-Token': 'wrong' } })).status).not.toBe(200);
    expect((await fetch(`${base}/data.php`, { headers: { 'X-Dashboard-Read-Token': READ } })).status).toBe(429);
  });
});
