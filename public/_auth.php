<?php
/**
 * כניסה מאובטחת לרשימות עם קישורים לשיחות (#6, הנחיית המנהל 1/11/2026): כניסה עם Google, רק למיילים ברשימה סגורה.
 * הקבצים הפרטיים יושבים בשרת מחוץ לתיקיית האתר (OSHER_PRIVATE_DIR, ברירת מחדל ~/osher-max-private):
 *   auth.json   {clientId, emails[]}, נכתב בפריסה מהסודות GOOGLE_CLIENT_ID ו-DASHBOARD_EMAILS
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

/** ההגדרה: מזהה הלקוח של Google ורשימת המיילים. null = הכניסה עוד לא הוגדרה */
function osher_auth_config(): ?array {
    $c = json_decode(osher_read_private('auth.json') ?? 'null', true);
    if (!is_array($c) || empty($c['clientId']) || empty($c['emails']) || !is_array($c['emails'])) return null;
    return ['clientId' => (string) $c['clientId'], 'emails' => array_values(array_map(fn ($e) => strtolower(trim((string) $e)), $c['emails']))];
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

/** עוגייה חתומה: המייל ותוקף, בלי מידע אחר */
function osher_auth_token(string $email, int $exp, string $secret): string {
    $payload = osher_b64(json_encode(['e' => $email, 'x' => $exp]));
    return $payload . '.' . osher_b64(hash_hmac('sha256', $payload, $secret, true));
}

/** המייל מתוך עוגייה תקינה, בתוקף ושעדיין ברשימה. אחרת null */
function osher_auth_check(string $token, string $secret, array $emails, int $now): ?string {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    if (!hash_equals(osher_b64(hash_hmac('sha256', $parts[0], $secret, true)), $parts[1])) return null;
    $p = json_decode(osher_unb64($parts[0]), true);
    if (!is_array($p) || !isset($p['e'], $p['x']) || (int) $p['x'] < $now) return null;
    $email = strtolower((string) $p['e']);
    return in_array($email, $emails, true) ? $email : null;
}

/** בדיקה של מה ש-Google החזיר על ה-ID token (tokeninfo). מחזיר את המייל אם מותר, אחרת null */
function osher_auth_verify_claims(array $claims, string $clientId, array $emails, int $now): ?string {
    if (($claims['aud'] ?? '') !== $clientId) return null;
    if (!in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) return null;
    if ((int) ($claims['exp'] ?? 0) < $now) return null;
    $verified = $claims['email_verified'] ?? false;
    if ($verified !== true && $verified !== 'true') return null;
    $email = strtolower((string) ($claims['email'] ?? ''));
    return $email !== '' && in_array($email, $emails, true) ? $email : null;
}

/** בודק את ה-ID token מול Google. null כשהבדיקה נכשלה */
function osher_google_claims(string $idToken): ?array {
    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code !== 200) return null;
    $c = json_decode($body, true);
    return is_array($c) ? $c : null;
}

/** המייל של מי שמחובר עכשיו, או null */
function osher_auth_email(): ?string {
    $cfg = osher_auth_config();
    $token = $_COOKIE[OSHER_AUTH_COOKIE] ?? '';
    if (!$cfg || $token === '') return null;
    $secret = osher_auth_secret();
    return $secret ? osher_auth_check($token, $secret, $cfg['emails'], time()) : null;
}

function osher_auth_set_cookie(string $value, int $exp): void {
    setcookie(OSHER_AUTH_COOKIE, $value, ['expires' => $exp, 'path' => OSHER_BASE_PATH, 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}
