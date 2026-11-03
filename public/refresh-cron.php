<?php
/**
 * הרענון האוטומטי היחיד של הדשבורד: פעם ביום ב-06:30 שעון ישראל, אחרי סריקות הלילה (הנחיית המנהל 3/11/2026).
 * רץ מ-crontab בשרת, בשורת הפקודה בלבד (php refresh-cron.php). מהדפדפן הוא מחזיר 404, ולכן אין כאן סוד או סיסמה.
 * אותה פונקציה כמו כפתור הרענון. מדפיס שורה אחת עם הזמן והספירות, בלי נתונים.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/_refresh.php';
[$code, $body] = osher_refresh();
echo gmdate('Y-m-d\TH:i:s\Z') . ' ' . $code . ' ' . json_encode($body, JSON_UNESCAPED_UNICODE) . "\n";
exit($code === 200 ? 0 : 1);
