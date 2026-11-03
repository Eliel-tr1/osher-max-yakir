<?php
/**
 * כפתור הרענון של הדשבורד: קורא את הגיליון עכשיו, דרך הפונקציה האחת שבונה את הנתונים (_refresh.php).
 * GET  -> מצב: מתי הנתונים נבנו (רק תאריך ומספר שורות)
 * POST -> רענון, רק למי שנכנס בסיסמה. כניסה לדף לא מפעילה רענון (הנחיית המנהל 3/11/2026).
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

require __DIR__ . '/_refresh.php';

function out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') out(200, ['ok' => true] + osher_current_meta(osher_data_file()));
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok' => false, 'error' => 'method']);
if (!osher_auth_in()) out(401, ['ok' => false, 'error' => 'צריך להיכנס']);
[$code, $body] = osher_refresh();
out($code, $body);
