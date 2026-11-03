import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
  let server: ChildProcess;

  beforeAll(async () => {
    writeFileSync(join(dir, 'auth.json'), JSON.stringify({ salt: 's', iter: 20000, hash: 'ab' }));
    writeFileSync(join(dir, 'leads.json'), '{"version":2,"generatedAt":"2026-11-03T04:30:00.000Z","sheetRows":1,"leads":[],"purchases":[]}');
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
  });
});
