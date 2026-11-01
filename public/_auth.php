<?php
/**
 * כניסה מאובטחת לרשימות עם קישורים לשיחות (#6). מ-1/11/2026 בסיסמה אחת (הנחיית המנהל), במקום Google.
 * הקבצים הפרטיים יושבים בשרת מחוץ לתיקיית האתר (OSHER_PRIVATE_DIR, ברירת מחדל ~/osher-max-private):
 *   auth.json      {salt, iter, hash}, גיבוב הסיסמה. נכתב בפריסה מהסוד DASHBOARD_PASSWORD (הסיסמה עצמה לא נשמרת)
 *   attempts.json  ניסיונות שגויים אחרונים, עם כתובת מגובבת
 *   secret.key  מפתח לחתימה על עוגיית הכניסה, נוצר בשימוש הראשון
 *   ids.json    הקודים המזהים, נכתב בכל רענון
 * הקובץ מגדיר פונקציות בלבד. גישה ישירה אליו מהדפדפן לא עושה כלום.
 */

const OSHER_AUTH_COOKIE = 'osher_auth';
const OSHER_AUTH_TTL = 12 * 3600;
const OSHER_BASE_PATH = '/oshermax/';

function osher_private_dir(): string {
    $dir = getenv('OSHER_PRIVATE_DIR') ?: dirname(__DIR__, 3) . '/osher-max-private';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir;
}

/** כתיבה בטוחה (קובץ זמני ואז החלפה), עם הרשאות לבעלים בלבד */
function osher_write_private(string $name, string $content): bool {
    $dir = osher_private_dir();
    $tmp = "$dir/$name.tmp";
    $old = umask(077);
    $ok = @file_put_contents($tmp, $content) !== false && @rename($tmp, "$dir/$name");
    umask($old);
    if (!$ok) {
        @unlink($tmp);
        error_log("osher-max: private write failed ($name)");
    }
    return $ok;
}

function osher_read_private(string $name): ?string {
    $f = osher_private_dir() . "/$name";
    $t = is_file($f) ? @file_get_contents($f) : false;
    return $t === false ? null : $t;
}

/** ההגדרה: גיבוב הסיסמה (PBKDF2-SHA256 עם מלח). null = הכניסה עוד לא הוגדרה */
function osher_auth_config(): ?array {
    $c = json_decode(osher_read_private('auth.json') ?? 'null', true);
    if (!is_array($c) || empty($c['salt']) || empty($c['hash']) || (int) ($c['iter'] ?? 0) < 10000) return null;
    return ['salt' => (string) $c['salt'], 'iter' => (int) $c['iter'], 'hash' => strtolower((string) $c['hash'])];
}

/** סיסמה נכונה? השוואה בזמן קבוע */
function osher_auth_password_ok(string $password, array $cfg): bool {
    if ($password === '' || strlen($password) > 200) return false;
    return hash_equals($cfg['hash'], hash_pbkdf2('sha256', $password, $cfg['salt'], $cfg['iter']));
}

/** גרסת הסיסמה: כשהסיסמה מתחלפת, כל העוגיות הקודמות כבר לא תקפות */
function osher_auth_version(array $cfg): string {
    return substr(hash('sha256', $cfg['salt'] . $cfg['hash']), 0, 16);
}

const OSHER_FAIL_WINDOW = 900;
const OSHER_FAIL_PER_IP = 5;
const OSHER_FAIL_TOTAL = 30;

/** הגבלת ניסיונות: עד 5 שגויים מאותה כתובת ועד 30 בסך הכול ב-15 דקות. הכתובת נשמרת מגובבת */
function osher_auth_blocked(string $ip, int $now): bool {
    $log = json_decode(osher_read_private('attempts.json') ?? '[]', true);
    if (!is_array($log)) $log = [];
    $recent = array_filter($log, fn ($a) => is_array($a) && ($a['t'] ?? 0) > $now - OSHER_FAIL_WINDOW);
    $key = hash('sha256', $ip);
    $mine = array_filter($recent, fn ($a) => ($a['ip'] ?? '') === $key);
    return count($mine) >= OSHER_FAIL_PER_IP || count($recent) >= OSHER_FAIL_TOTAL;
}

function osher_auth_failed(string $ip, int $now): void {
    $log = json_decode(osher_read_private('attempts.json') ?? '[]', true);
    if (!is_array($log)) $log = [];
    $log = array_values(array_filter($log, fn ($a) => is_array($a) && ($a['t'] ?? 0) > $now - OSHER_FAIL_WINDOW));
    $log[] = ['t' => $now, 'ip' => hash('sha256', $ip)];
    osher_write_private('attempts.json', json_encode(array_slice($log, -200)));
}

function osher_auth_secret(): ?string {
    $s = osher_read_private('secret.key');
    if ($s !== null && strlen($s) >= 32) return $s;
    $new = bin2hex(random_bytes(32));
    return osher_write_private('secret.key', $new) ? $new : null;
}

function osher_b64(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function osher_unb64(string $s): string {
    return (string) base64_decode(strtr($s, '-_', '+/'));
}

/** עוגייה חתומה: גרסת הסיסמה ותוקף, בלי מידע אחר */
function osher_auth_token(string $version, int $exp, string $secret): string {
    $payload = osher_b64(json_encode(['v' => $version, 'x' => $exp]));
    return $payload . '.' . osher_b64(hash_hmac('sha256', $payload, $secret, true));
}

/** עוגייה תקינה, בתוקף ומהסיסמה הנוכחית? */
function osher_auth_check(string $token, string $secret, string $version, int $now): bool {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return false;
    if (!hash_equals(osher_b64(hash_hmac('sha256', $parts[0], $secret, true)), $parts[1])) return false;
    $p = json_decode(osher_unb64($parts[0]), true);
    if (!is_array($p) || !isset($p['v'], $p['x']) || (int) $p['x'] < $now) return false;
    return hash_equals($version, (string) $p['v']);
}

/** האם מי שגולש עכשיו מחובר */
function osher_auth_in(): bool {
    $cfg = osher_auth_config();
    $token = $_COOKIE[OSHER_AUTH_COOKIE] ?? '';
    if (!$cfg || $token === '') return false;
    $secret = osher_auth_secret();
    return $secret ? osher_auth_check($token, $secret, osher_auth_version($cfg), time()) : false;
}

function osher_auth_set_cookie(string $value, int $exp): void {
    setcookie(OSHER_AUTH_COOKIE, $value, ['expires' => $exp, 'path' => OSHER_BASE_PATH, 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}
