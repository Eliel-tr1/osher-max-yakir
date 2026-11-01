import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** הכניסה המאובטחת (#6): עוגייה חתומה, בדיקת התשובה של Google ורשימת המיילים. רץ ב-PHP, כמו בשרת. */
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function run(code: string, dir = mkdtempSync(join(tmpdir(), 'auth-'))): unknown {
  const src = `require 'public/_auth.php'; echo json_encode((function () { ${code} })());`;
  return JSON.parse(execFileSync('php', ['-r', src], { encoding: 'utf8', env: { ...process.env, OSHER_PRIVATE_DIR: dir } }));
}

describe.skipIf(!php)('secure login', () => {
  const now = 1_800_000_000;

  it('accepts a signed, fresh cookie for the current password version only', () => {
    expect(run(`$t = osher_auth_token('v1', ${now + 60}, 'k'); return osher_auth_check($t, 'k', 'v1', ${now});`)).toBe(true);
    // פג תוקף
    expect(run(`$t = osher_auth_token('v1', ${now - 1}, 'k'); return osher_auth_check($t, 'k', 'v1', ${now});`)).toBe(false);
    // מפתח אחר, או חתימה שזויפה
    expect(run(`$t = osher_auth_token('v1', ${now + 60}, 'k'); return osher_auth_check($t, 'other', 'v1', ${now});`)).toBe(false);
    expect(run(`$t = osher_auth_token('v2', ${now + 60}, 'k'); [$p] = explode('.', $t); $good = osher_auth_token('v1', ${now + 60}, 'k'); [, $sig] = explode('.', $good); return osher_auth_check($p . '.' . $sig, 'k', 'v1', ${now});`)).toBe(false);
    // הסיסמה התחלפה
    expect(run(`$t = osher_auth_token('v1', ${now + 60}, 'k'); return osher_auth_check($t, 'k', 'v2', ${now});`)).toBe(false);
    expect(run(`return osher_auth_check('garbage', 'k', 'v1', ${now});`)).toBe(false);
  });

  it('checks the password against the hash the deploy writes (same PBKDF2 as python)', () => {
    const salt = 'abcd';
    const hash = execFileSync('python3', ['-c', `import hashlib; print(hashlib.pbkdf2_hmac('sha256', b'test-pass', b'${salt}', 20000).hex())`], { encoding: 'utf8' }).trim();
    const cfg = `['salt' => '${salt}', 'iter' => 20000, 'hash' => '${hash}']`;
    expect(run(`return osher_auth_password_ok('test-pass', ${cfg});`)).toBe(true);
    expect(run(`return osher_auth_password_ok('test-pasS', ${cfg});`)).toBe(false);
    expect(run(`return osher_auth_password_ok('', ${cfg});`)).toBe(false);
  });

  it('blocks after 5 wrong tries from one address within 15 minutes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-'));
    expect(run(`for ($i = 0; $i < 4; $i++) osher_auth_failed('1.2.3.4', ${now}); return osher_auth_blocked('1.2.3.4', ${now});`, dir)).toBe(false);
    expect(run(`osher_auth_failed('1.2.3.4', ${now}); return [osher_auth_blocked('1.2.3.4', ${now}), osher_auth_blocked('5.6.7.8', ${now}), osher_auth_blocked('1.2.3.4', ${now + 901})];`, dir)).toEqual([true, false, false]);
    expect(readFileSync(join(dir, 'attempts.json'), 'utf8')).not.toContain('1.2.3.4');
  });

  it('is not configured until the deploy writes the hash, and keeps private files for the owner only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-'));
    expect(run('return osher_auth_config();', dir)).toBeNull();
    expect(run(`return osher_write_private('auth.json', json_encode(['salt' => 's', 'iter' => 300000, 'hash' => 'AB']));`, dir)).toBe(true);
    expect(run('return osher_auth_config();', dir)).toEqual({ salt: 's', iter: 300000, hash: 'ab' });
    expect(statSync(join(dir, 'auth.json')).mode & 0o077).toBe(0);
    const secret = run('return osher_auth_secret();', dir) as string;
    expect(secret).toHaveLength(64);
    expect(run('return osher_auth_secret();', dir)).toBe(secret);
    expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(secret);
  });
});
