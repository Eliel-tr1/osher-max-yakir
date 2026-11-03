<?php
/**
 * קובץ הנתונים של הדשבורד, רק למי שנכנס בסיסמה (הנחיית המנהל 1/11/2026: כל הדשבורד מאחורי סיסמה),
 * או עם הסוד של גישת הקריאה בכותרת X-Dashboard-Read-Token (#28, 3/11/2026).
 * הקובץ יושב מחוץ לתיקיית האתר (~/osher-max-private/leads.json) ונכתב ברענון ובפריסה.
 */
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex');

require __DIR__ . '/_auth.php';

function deny(int $code, string $error): void {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

// גישת קריאה עם סוד בכותרת (#28): אותו קובץ נתונים, בלי הקודים המזהים (הם רק ב-links.php) ובלי שום פעולת כתיבה
$readToken = $_SERVER['HTTP_X_DASHBOARD_READ_TOKEN'] ?? null;
if ($readToken !== null) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $now = time();
    if (osher_auth_blocked($ip, $now, OSHER_READ_ATTEMPTS)) deny(429, 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות');
    if (!osher_read_token_ok((string) $readToken)) {
        osher_auth_failed($ip, $now, OSHER_READ_ATTEMPTS);
        deny(401, 'סוד שגוי');
    }
} else {
    if (!osher_auth_config()) deny(503, 'הכניסה עוד לא הוגדרה');
    if (!osher_auth_in()) deny(401, 'צריך להיכנס');
}
$f = osher_data_file();
if (!is_file($f)) deny(404, 'עוד אין נתונים. אפשר ללחוץ על רענון מהטבלה');
header('Content-Type: application/json; charset=utf-8');
readfile($f);
