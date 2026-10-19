<?php
/**
 * כפתור הרענון של הדשבורד: מבקש מגיטהאב להריץ את "עדכון נתונים" (refresh-data.yml).
 * GET  -> מצב: האם מוגדר, ומתי הייתה הבקשה האחרונה
 * POST -> מפעיל עדכון. פעם בדקה לכל היותר; לחיצה נוספת בתוך הדקה מחכה לאותו עדכון.
 *
 * המפתח לגיטהאב לא נמצא כאן: הוא בקובץ מחוץ לתיקיית האתר, שהפריסה כותבת מהסוד REFRESH_TOKEN.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const COOLDOWN = 60;

function out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

// /home/<user>/htdocs/<site>/oshermax -> /home/<user>
$home = dirname(__DIR__, 3);
$state = $home . '/.cache/osher-max-dashboard';
$configFile = $state . '/refresh-config.php';
$config = @is_readable($configFile) ? (include $configFile) : null;
$configured = is_array($config) && !empty($config['token']) && !empty($config['repo']);

$lastFile = (@is_writable($state) ? $state : sys_get_temp_dir()) . '/osher-max-last-refresh';
$last = @is_readable($lastFile) ? (int) @file_get_contents($lastFile) : 0;
$iso = fn (int $t) => gmdate('Y-m-d\TH:i:s\Z', $t);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    out(200, ['ok' => true, 'configured' => $configured, 'lastRequestedAt' => $last ? $iso($last) : null]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out(405, ['ok' => false, 'error' => 'method']);
}
if (!$configured) {
    out(503, ['ok' => false, 'error' => 'הכפתור עוד לא הוגדר (חסר REFRESH_TOKEN)']);
}

$now = time();
if ($last && $now - $last < COOLDOWN) {
    // עדכון כבר בדרך: מחכים לו
    out(200, ['ok' => true, 'requestedAt' => $iso($last), 'reused' => true]);
}

$url = 'https://api.github.com/repos/' . $config['repo'] . '/actions/workflows/' . ($config['workflow'] ?? 'refresh-data.yml') . '/dispatches';
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['ref' => $config['ref'] ?? 'main']),
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $config['token'],
        'Accept: application/vnd.github+json',
        'X-GitHub-Api-Version: 2022-11-28',
        'Content-Type: application/json',
        'User-Agent: osher-max-dashboard',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
]);
curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($code !== 204) {
    $why = $code === 401 || $code === 403 ? 'המפתח לגיטהאב לא תקף או בלי הרשאה' : ($err ?: "HTTP $code");
    error_log("osher-max refresh failed: $code $err");
    out(502, ['ok' => false, 'error' => $why]);
}

@file_put_contents($lastFile, (string) $now);
out(200, ['ok' => true, 'requestedAt' => $iso($now)]);
