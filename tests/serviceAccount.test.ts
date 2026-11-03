import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * קריאת הגיליון עם חשבון שירות (#29), מול שרת מדומה של Google: הטוקן, הקריאה עם הטוקן, המטמון, ומה קורה כשמשהו לא
 * מוגדר עד הסוף. בלי מפתח בשרת, הקריאה כמו היום, בקישור הציבורי.
 */
const php = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const ROUTER = `<?php
$log = getenv('MOCK_LOG');
$mode = trim((string) @file_get_contents(getenv('MOCK_MODE'))) ?: 'ok';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$h = function_exists('getallheaders') ? getallheaders() : [];
$auth = $h['Authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
file_put_contents($log, json_encode(['path' => $path, 'auth' => $auth, 'post' => $_POST, 'gid' => $_GET['gid'] ?? null]) . "\\n", FILE_APPEND);
if ($path === '/token') {
    header('Content-Type: application/json');
    if ($mode === 'token-fail') { http_response_code(400); echo json_encode(['error' => 'invalid_grant', 'error_description' => 'secret detail']); return; }
    echo json_encode(['access_token' => 'tok-1', 'expires_in' => 3600, 'token_type' => 'Bearer']);
    return;
}
if ($path === '/export') {
    $sa = $auth === 'Bearer tok-1';
    if ($mode === 'not-shared' && $sa) { http_response_code(403); echo 'forbidden'; return; }
    if ($mode === 'restricted' && !$sa) { echo '<html><body>sign in</body></html>'; return; }
    header('Content-Type: text/csv');
    echo "a,b\\n1,2\\n";
    return;
}
http_response_code(404);
`;

describe.skipIf(!php)('reading the sheet with a Google service account', () => {
  const port = 4800 + Math.floor(Math.random() * 400);
  const base = `http://127.0.0.1:${port}`;
  const work = mkdtempSync(join(tmpdir(), 'gsa-'));
  const priv = join(work, 'private');
  const log = join(work, 'log.jsonl');
  const mode = join(work, 'mode');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyJson = JSON.stringify({
    type: 'service_account',
    client_email: 'reader@demo-project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    token_uri: `${base}/token`,
  });
  let server: ChildProcess;

  const requests = (): { path: string; auth: string; post: Record<string, string>; gid: string | null }[] =>
    existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const run = (): { source: string; note: string | null; csv: string | null; err: string | null; out: string } => {
    const code = `require 'public/_refresh.php'; $a = osher_sheet_auth(); [$csv, $err] = osher_fetch_with_fallback('0', $a); echo json_encode(['source' => $a['source'], 'note' => $a['note'], 'csv' => $csv, 'err' => $err], JSON_UNESCAPED_UNICODE);`;
    const out = execFileSync('php', ['-r', code], {
      encoding: 'utf8',
      env: { ...process.env, OSHER_PRIVATE_DIR: priv, OSHER_SHEET_EXPORT: `${base}/export?gid={gid}` },
    });
    return { ...JSON.parse(out), out };
  };
  const setMode = (m: string) => writeFileSync(mode, m);
  const withKey = () => {
    execFileSync('mkdir', ['-p', priv]);
    writeFileSync(join(priv, 'google-sa.json'), keyJson, { mode: 0o600 });
  };

  beforeAll(async () => {
    writeFileSync(join(work, 'router.php'), ROUTER);
    server = spawn('php', ['-S', `127.0.0.1:${port}`, join(work, 'router.php')], { env: { ...process.env, MOCK_LOG: log, MOCK_MODE: mode }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(`${base}/ping`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
  afterAll(() => {
    server?.kill();
    rmSync(work, { recursive: true, force: true });
  });
  beforeEach(() => {
    rmSync(priv, { recursive: true, force: true });
    rmSync(log, { force: true });
    setMode('ok');
  });

  it('reads through the public link, as today, when there is no key on the server', () => {
    const r = run();
    expect(r).toMatchObject({ source: 'public', note: null, csv: 'a,b\n1,2\n', err: null });
    const req = requests();
    expect(req.map((x) => x.path)).toEqual(['/export']);
    expect(req[0].auth).toBe('');
    expect(req[0].gid).toBe('0');
  });

  it('asks Google for a read-only token with a signed request, and reads the sheet with it', () => {
    withKey();
    const r = run();
    expect(r).toMatchObject({ source: 'service-account', note: null, csv: 'a,b\n1,2\n', err: null });
    const [tok, exp] = requests();
    expect(tok.path).toBe('/token');
    expect(tok.post.grant_type).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c, sig] = tok.post.assertion.split('.');
    const dec = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    expect(dec(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = dec(c);
    expect(claims).toMatchObject({
      iss: 'reader@demo-project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: `${base}/token`,
    });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(Math.abs(claims.iat - Date.now() / 1000)).toBeLessThan(60);
    // החתימה נבדקת עם המפתח הציבורי, כמו ש-Google בודקת
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(exp).toMatchObject({ path: '/export', auth: 'Bearer tok-1' });
    // המפתח לא יוצא בפלט
    expect(r.out).not.toContain('PRIVATE KEY');
  });

  it('keeps the token for an hour in the private folder, readable only by the owner', () => {
    withKey();
    run();
    run();
    expect(requests().filter((x) => x.path === '/token')).toHaveLength(1);
    expect(requests().filter((x) => x.path === '/export').every((x) => x.auth === 'Bearer tok-1')).toBe(true);
    const cache = join(priv, 'google-token.json');
    expect(statSync(cache).mode & 0o077).toBe(0);
    expect(JSON.parse(readFileSync(cache, 'utf8')).email).toBe('reader@demo-project.iam.gserviceaccount.com');
  });

  it('falls back to the public link when Google refuses the key, and says why without the details', () => {
    withKey();
    setMode('token-fail');
    const r = run();
    expect(r.source).toBe('public');
    expect(r.note).toContain('invalid_grant');
    expect(r.note).not.toContain('secret detail');
    expect(r.csv).toBe('a,b\n1,2\n');
    expect(requests().find((x) => x.path === '/export')?.auth).toBe('');
  });

  it('falls back to the public link when the sheet is not shared with the service account yet', () => {
    withKey();
    setMode('not-shared');
    const r = run();
    expect(r.source).toBe('public');
    expect(r.note).toContain('חשבון השירות לא הצליח לקרוא');
    expect(r.csv).toBe('a,b\n1,2\n');
    expect(requests().filter((x) => x.path === '/export').map((x) => x.auth)).toEqual(['Bearer tok-1', '']);
  });

  it('keeps working after the sharing is restricted, and only with the service account', () => {
    setMode('restricted');
    const before = run();
    expect(before.csv).toBeNull();
    expect(before.err).toContain('גוגל החזיר דף');
    withKey();
    const after = run();
    expect(after).toMatchObject({ source: 'service-account', csv: 'a,b\n1,2\n', err: null });
  });

  it('prints only a token for the GitHub checks, never the key', () => {
    const keyFile = join(work, 'sa.json');
    writeFileSync(keyFile, keyJson, { mode: 0o600 });
    const out = execFileSync('php', ['scripts/google-token.php', keyFile], { encoding: 'utf8' });
    expect(out).toBe('tok-1');
    setMode('token-fail');
    let err = '';
    try {
      execFileSync('php', ['scripts/google-token.php', keyFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? '');
    }
    expect(err).toContain('invalid_grant');
    expect(err).not.toContain('PRIVATE KEY');
  });
});
