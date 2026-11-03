<?php
/**
 * קריאת הגיליון עם חשבון שירות של Google (#29, הנחיית המנהל 3/11/2026 סעיף 5), כדי שאפשר יהיה להגביל את השיתוף של
 * הגיליון בלי לשבור את הדשבורד. המפתח בקובץ פרטי בשרת, `google-sa.json` בתיקייה הפרטית, שנכתב בפריסה מהסוד
 * GOOGLE_SA_JSON. בלי הקובץ הקריאה נשארת כמו היום, בקישור הציבורי.
 * חשבון השירות מקבל הרשאת צפייה בלבד בגיליון, וטוקן לקריאה בלבד (drive.readonly). שום דבר לא נכתב לגיליון.
 * הקובץ מגדיר פונקציות בלבד. גישה ישירה אליו מהדפדפן לא עושה כלום.
 */
require_once __DIR__ . '/_auth.php';

const OSHER_GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const OSHER_GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OSHER_GOOGLE_KEY_FILE = 'google-sa.json';
const OSHER_GOOGLE_TOKEN_CACHE = 'google-token.json';

function osher_b64url(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** מפתח של חשבון שירות (הקובץ ש-Google נותנת), או null כשהוא חסר או לא שלם */
function osher_google_key_from(?string $json): ?array {
    $k = json_decode($json ?? 'null', true);
    if (!is_array($k) || empty($k['client_email']) || empty($k['private_key'])) return null;
    return $k;
}

/** המפתח שבתיקייה הפרטית בשרת, או null: אז קוראים בקישור הציבורי */
function osher_google_key(): ?array {
    return osher_google_key_from(osher_read_private(OSHER_GOOGLE_KEY_FILE));
}

/** בקשה חתומה (JWT, RS256) לטוקן של שעה */
function osher_google_assertion(array $key, int $now): ?string {
    $head = osher_b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claims = osher_b64url(json_encode([
        'iss' => $key['client_email'],
        'scope' => OSHER_GOOGLE_SCOPE,
        'aud' => $key['token_uri'] ?? OSHER_GOOGLE_TOKEN_URL,
        'iat' => $now,
        'exp' => $now + 3600,
    ], JSON_UNESCAPED_SLASHES));
    $pk = @openssl_pkey_get_private((string) $key['private_key']);
    if (!$pk || !openssl_sign("$head.$claims", $sig, $pk, OPENSSL_ALGO_SHA256)) return null;
    return "$head.$claims." . osher_b64url($sig);
}

/** טוקן חדש מ-Google. מחזיר [טוקן, שניות עד שפג, שגיאה]. השגיאה בלי פרטי המפתח */
function osher_google_request_token(array $key): array {
    $jwt = osher_google_assertion($key, time());
    if (!$jwt) return [null, 0, 'המפתח של חשבון השירות לא תקין'];
    $ch = curl_init($key['token_uri'] ?? OSHER_GOOGLE_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt]),
        CURLOPT_TIMEOUT => 30,
        CURLOPT_USERAGENT => 'osher-max-dashboard',
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $r = is_string($body) ? json_decode($body, true) : null;
    if ($code !== 200 || !is_array($r) || empty($r['access_token'])) {
        // רק סוג השגיאה של Google (למשל invalid_grant), בלי התשובה המלאה
        $why = is_array($r) && isset($r['error']) && is_string($r['error']) ? preg_replace('/[^a-z_]/', '', $r['error']) : ($err ?: "HTTP $code");
        error_log("osher-max: google token failed ($why)");
        return [null, 0, "Google לא נתן טוקן: $why"];
    }
    return [(string) $r['access_token'], (int) ($r['expires_in'] ?? 3600), null];
}

/** טוקן לקריאה, עם מטמון בתיקייה הפרטית עד דקה לפני שהוא פג. מחזיר [טוקן, שגיאה] */
function osher_google_token(array $key): array {
    $now = time();
    $cache = json_decode(osher_read_private(OSHER_GOOGLE_TOKEN_CACHE) ?? 'null', true);
    if (is_array($cache) && ($cache['email'] ?? '') === $key['client_email'] && (int) ($cache['exp'] ?? 0) > $now + 60 && !empty($cache['token'])) {
        return [(string) $cache['token'], null];
    }
    [$token, $ttl, $err] = osher_google_request_token($key);
    if (!$token) return [null, $err];
    osher_write_private(OSHER_GOOGLE_TOKEN_CACHE, json_encode(['email' => $key['client_email'], 'token' => $token, 'exp' => $now + $ttl]));
    return [$token, null];
}

/**
 * איך קוראים את הגיליון ברענון הזה: עם חשבון שירות כשיש מפתח בשרת, אחרת בקישור הציבורי כמו היום.
 * מחזיר ['token' => טוקן או null, 'source' => 'service-account' או 'public', 'note' => למה לא חשבון שירות, או null].
 */
function osher_sheet_auth(): array {
    $key = osher_google_key();
    if (!$key) return ['token' => null, 'source' => 'public', 'note' => null];
    [$token, $err] = osher_google_token($key);
    if (!$token) return ['token' => null, 'source' => 'public', 'note' => "חשבון השירות לא קיבל גישה ($err), נקרא בקישור הציבורי"];
    return ['token' => $token, 'source' => 'service-account', 'note' => null];
}
