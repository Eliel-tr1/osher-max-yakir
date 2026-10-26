<?php
/**
 * כפתור הרענון של הדשבורד: קורא את לשונית הלידים מגוגל שיטס, מנקה כפילויות ופרטים אישיים,
 * ומחליף את data/leads.json. הכול בשרת, בלי גיטהאב ובלי מפתחות.
 * GET  -> מצב: מתי הנתונים נבנו
 * POST -> רענון. לכל היותר פעם ב-10 שניות; לחיצות בזמן רענון מחכות לו.
 * העיבוד עצמו ב-_leads.php, שנבדק מול גרסת ה-TypeScript (tests/parity.test.ts).
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

require __DIR__ . '/_leads.php';

const SHEET_ID = '1nTqoRITyNlLJO4Pld0H4SRMIbT21oudBw6mDBoxXaUU';
const SHEET_TAB = 'לידים';
const SHEET_GID = '0';   // הלשונית "לידים". ייצוא מלא: כולל גם שורות שמוסתרות בסינון בטבלה (החלטת המנהל, 2026-10-26)
const MIN_GAP = 10;

$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/leads.json';

function out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function current_meta(string $file): array {
    $head = @file_get_contents($file, false, null, 0, 400) ?: '';
    preg_match('/"generatedAt":"([^"]+)"/', $head, $g);
    preg_match('/"sheetRows":(\d+)/', $head, $r);
    return ['generatedAt' => $g[1] ?? null, 'sheetRows' => isset($r[1]) ? (int) $r[1] : null];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    out(200, ['ok' => true] + current_meta($dataFile));
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out(405, ['ok' => false, 'error' => 'method']);
}
if (!is_dir($dataDir) && !@mkdir($dataDir, 0755, true)) {
    out(500, ['ok' => false, 'error' => 'אין תיקיית נתונים']);
}

// נעילה: רענון אחד בכל פעם. מי שמגיע באמצע מחכה, ומקבל את התוצאה של אותו רענון.
$lock = fopen($dataDir . '/.refresh.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    out(500, ['ok' => false, 'error' => 'נעילה נכשלה']);
}
$meta = current_meta($dataFile);
$age = $meta['generatedAt'] ? time() - strtotime($meta['generatedAt']) : PHP_INT_MAX;
if ($age < MIN_GAP) {
    out(200, ['ok' => true, 'reused' => true] + $meta);
}

$url = getenv('OSHER_SHEET_URL') ?: 'https://docs.google.com/spreadsheets/d/' . rawurlencode(SHEET_ID) . '/export?format=csv&gid=' . SHEET_GID;
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 40,
    CURLOPT_USERAGENT => 'osher-max-dashboard',
]);
$csv = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($csv === false || $code !== 200) {
    error_log("osher-max refresh: sheet HTTP $code $err");
    out(502, ['ok' => false, 'error' => 'קריאת הטבלה נכשלה (' . ($err ?: "HTTP $code") . '). הנתונים הקודמים נשארו.']);
}
if (preg_match('/^\s*</', $csv)) {
    out(502, ['ok' => false, 'error' => 'גוגל החזיר דף ולא טבלה: כנראה הטבלה לא משותפת לצפייה. הנתונים הקודמים נשארו.']);
}

try {
    $file = osher_leads_from_rows(osher_parse_csv($csv), new DateTimeImmutable('now', new DateTimeZone('UTC')));
} catch (RuntimeException $e) {
    out(422, ['ok' => false, 'error' => $e->getMessage() . '. הנתונים הקודמים נשארו.']);
}
if (!$file['leads']) {
    out(422, ['ok' => false, 'error' => 'לא נמצאו לידים בטבלה. הנתונים הקודמים נשארו.']);
}

$tmp = $dataFile . '.tmp';
if (@file_put_contents($tmp, osher_pack($file)) === false || !@rename($tmp, $dataFile)) {
    @unlink($tmp);
    out(500, ['ok' => false, 'error' => 'שמירת הנתונים נכשלה']);
}
out(200, [
    'ok' => true,
    'generatedAt' => $file['generatedAt'],
    'sheetRows' => $file['sheetRows'],
    'duplicatesRemoved' => $file['duplicatesRemoved'],
    'leads' => count($file['leads']),
]);
