<?php
/**
 * קובץ הנתונים של הדשבורד, רק למי שנכנס בסיסמה (הנחיית המנהל 1/11/2026: כל הדשבורד מאחורי סיסמה).
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

if (!osher_auth_config()) deny(503, 'הכניסה עוד לא הוגדרה');
if (!osher_auth_in()) deny(401, 'צריך להיכנס');
$f = osher_data_file();
if (!is_file($f)) deny(404, 'עוד אין נתונים. אפשר ללחוץ על רענון מהטבלה');
header('Content-Type: application/json; charset=utf-8');
readfile($f);
