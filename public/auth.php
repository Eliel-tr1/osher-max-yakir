<?php
/**
 * כניסה בסיסמה לרשימות עם קישורים (#6, הנחיית המנהל 1/11/2026).
 * GET  -> {configured, in, links}
 * POST {password} -> בודק מול הגיבוב, עם הגבלת ניסיונות, ושם עוגייה חתומה ל-12 שעות
 * POST {logout: true} -> יציאה
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex');

require __DIR__ . '/_auth.php';

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

$cfg = osher_auth_config();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    reply(200, ['ok' => true, 'configured' => $cfg !== null, 'in' => osher_auth_in(), 'links' => osher_read_private('ids.json') !== null]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'method']);

$in = json_decode(file_get_contents('php://input') ?: 'null', true);
if (!is_array($in)) reply(400, ['ok' => false, 'error' => 'בקשה לא תקינה']);

if (!empty($in['logout'])) {
    osher_auth_set_cookie('', time() - 3600);
    reply(200, ['ok' => true, 'in' => false]);
}
if (!$cfg) reply(503, ['ok' => false, 'error' => 'הכניסה עוד לא הוגדרה']);

$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$now = time();
if (osher_auth_blocked($ip, $now)) reply(429, ['ok' => false, 'error' => 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות']);

$password = is_string($in['password'] ?? null) ? trim($in['password']) : '';
if (!osher_auth_password_ok($password, $cfg)) {
    osher_auth_failed($ip, $now);
    error_log('osher-max: login refused');
    reply(403, ['ok' => false, 'error' => 'סיסמה שגויה']);
}
$secret = osher_auth_secret();
if (!$secret) reply(500, ['ok' => false, 'error' => 'הכניסה לא זמינה כרגע']);

$exp = $now + OSHER_AUTH_TTL;
osher_auth_set_cookie(osher_auth_token(osher_auth_version($cfg), $exp, $secret), $exp);
reply(200, ['ok' => true, 'in' => true]);
