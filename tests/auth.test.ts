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
  const emails = "['boss@example.com']";

  it('accepts a signed, fresh cookie for an allowed email only', () => {
    expect(run(`$t = osher_auth_token('boss@example.com', ${now + 60}, 'k'); return osher_auth_check($t, 'k', ${emails}, ${now});`)).toBe('boss@example.com');
    // פג תוקף
    expect(run(`$t = osher_auth_token('boss@example.com', ${now - 1}, 'k'); return osher_auth_check($t, 'k', ${emails}, ${now});`)).toBeNull();
    // מפתח אחר, או חתימה שזויפה
    expect(run(`$t = osher_auth_token('boss@example.com', ${now + 60}, 'k'); return osher_auth_check($t, 'other', ${emails}, ${now});`)).toBeNull();
    expect(run(`$t = osher_auth_token('x@example.com', ${now + 60}, 'k'); [$p] = explode('.', $t); $good = osher_auth_token('boss@example.com', ${now + 60}, 'k'); [, $sig] = explode('.', $good); return osher_auth_check($p . '.' . $sig, 'k', ${emails}, ${now});`)).toBeNull();
    // מייל שהוצא מהרשימה
    expect(run(`$t = osher_auth_token('boss@example.com', ${now + 60}, 'k'); return osher_auth_check($t, 'k', ['other@example.com'], ${now});`)).toBeNull();
    expect(run(`return osher_auth_check('garbage', 'k', ${emails}, ${now});`)).toBeNull();
  });

  it('checks what Google says about the sign in', () => {
    const ok = `['aud' => 'cid', 'iss' => 'https://accounts.google.com', 'exp' => '${now + 60}', 'email_verified' => 'true', 'email' => 'Boss@Example.com']`;
    expect(run(`return osher_auth_verify_claims(${ok}, 'cid', ${emails}, ${now});`)).toBe('boss@example.com');
    expect(run(`$c = ${ok}; $c['aud'] = 'other'; return osher_auth_verify_claims($c, 'cid', ${emails}, ${now});`)).toBeNull();
    expect(run(`$c = ${ok}; $c['iss'] = 'evil.com'; return osher_auth_verify_claims($c, 'cid', ${emails}, ${now});`)).toBeNull();
    expect(run(`$c = ${ok}; $c['email_verified'] = 'false'; return osher_auth_verify_claims($c, 'cid', ${emails}, ${now});`)).toBeNull();
    expect(run(`$c = ${ok}; $c['exp'] = '${now - 1}'; return osher_auth_verify_claims($c, 'cid', ${emails}, ${now});`)).toBeNull();
    expect(run(`$c = ${ok}; $c['email'] = 'stranger@example.com'; return osher_auth_verify_claims($c, 'cid', ${emails}, ${now});`)).toBeNull();
  });

  it('is not configured until the deploy writes the client id and the emails, and keeps private files for the owner only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-'));
    expect(run('return osher_auth_config();', dir)).toBeNull();
    expect(run(`return osher_write_private('auth.json', json_encode(['clientId' => 'cid', 'emails' => [' Boss@Example.com ']]));`, dir)).toBe(true);
    expect(run('return osher_auth_config();', dir)).toEqual({ clientId: 'cid', emails: ['boss@example.com'] });
    expect(statSync(join(dir, 'auth.json')).mode & 0o077).toBe(0);
    const secret = run('return osher_auth_secret();', dir) as string;
    expect(secret).toHaveLength(64);
    expect(run('return osher_auth_secret();', dir)).toBe(secret);
    expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(secret);
  });
});
