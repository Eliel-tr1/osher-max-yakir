<?php
/**
 * כניסה עם Google לרשימות עם קישורים (#6).
 * GET  -> {configured, clientId, email, links}
 * POST {credential} -> בודק את ה-ID token מול Google ואת רשימת המיילים, ושם עוגייה חתומה ל-12 שעות
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
    reply(200, [
        'ok' => true,
        'configured' => $cfg !== null,
        'clientId' => $cfg['clientId'] ?? null,
        'email' => osher_auth_email(),
        'links' => osher_read_private('ids.json') !== null,
    ]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'method']);

$in = json_decode(file_get_contents('php://input') ?: 'null', true);
if (!is_array($in)) reply(400, ['ok' => false, 'error' => 'בקשה לא תקינה']);

if (!empty($in['logout'])) {
    osher_auth_set_cookie('', time() - 3600);
    reply(200, ['ok' => true, 'email' => null]);
}
if (!$cfg) reply(503, ['ok' => false, 'error' => 'הכניסה עוד לא הוגדרה']);

$credential = is_string($in['credential'] ?? null) ? $in['credential'] : '';
if ($credential === '' || strlen($credential) > 4096) reply(400, ['ok' => false, 'error' => 'חסר אישור מ-Google']);

$claims = osher_google_claims($credential);
$email = $claims ? osher_auth_verify_claims($claims, $cfg['clientId'], $cfg['emails'], time()) : null;
if (!$email) {
    error_log('osher-max: login refused');
    reply(403, ['ok' => false, 'error' => 'המייל הזה לא ברשימה של הדשבורד']);
}
$secret = osher_auth_secret();
if (!$secret) reply(500, ['ok' => false, 'error' => 'הכניסה לא זמינה כרגע']);

$exp = time() + OSHER_AUTH_TTL;
osher_auth_set_cookie(osher_auth_token($email, $exp, $secret), $exp);
reply(200, ['ok' => true, 'email' => $email]);
