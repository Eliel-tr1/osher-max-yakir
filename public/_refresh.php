<?php
/**
 * הפונקציה האחת שבונה את הנתונים מהגיליון (הנחיית המנהל 3/11/2026). קוראים לה רק שני מקומות:
 *   refresh.php       כפתור "רענון מהטבלה" בדשבורד, למי שנכנס בסיסמה
 *   refresh-cron.php  הרענון האוטומטי היחיד: פעם ביום ב-06:30 שעון ישראל, מ-crontab בשרת
 * קוראת את הגיליון בלבד: בלי AI ובלי CloudChat. לכל היותר רענון אחד בכל רגע (נעילה), ולא יותר מפעם ב-10 שניות.
 * הקובץ מגדיר פונקציות בלבד. גישה ישירה אליו מהדפדפן לא עושה כלום.
 */
require_once __DIR__ . '/_leads.php';
require_once __DIR__ . '/_auth.php';

const OSHER_SHEET_ID = '1nTqoRITyNlLJO4Pld0H4SRMIbT21oudBw6mDBoxXaUU';
const OSHER_SHEET_GID = '0';            // הלשונית "לידים". ייצוא מלא: כולל גם שורות שמוסתרות בסינון בטבלה (החלטת המנהל, 2026-10-26)
const OSHER_PURCHASES_GID = '282711056'; // הלשונית "רכישות": שורה לכל רכישה (החלטת המנהל, 2026-10-29)
const OSHER_MAILINGS_GID = '704173708';  // הלשונית "דיוורים": שורה לכל רכישה בקמפיין (31/10/2026). חסרה = הסקשן מוסתר
const OSHER_WAVES_GID = '359996576';     // הלשונית "דיוורים - סיכום"
const OSHER_MIN_GAP = 10;

/** מתי נבנו הנתונים שבשרת עכשיו: רק תאריך ומספר שורות */
function osher_current_meta(string $file): array {
    $head = @file_get_contents($file, false, null, 0, 400) ?: '';
    preg_match('/"generatedAt":"([^"]+)"/', $head, $g);
    preg_match('/"sheetRows":(\d+)/', $head, $r);
    return ['generatedAt' => $g[1] ?? null, 'sheetRows' => isset($r[1]) ? (int) $r[1] : null];
}

/** ייצוא CSV מלא של לשונית אחת (כולל שורות שמוסתרות בסינון). מחזיר [csv, שגיאה] */
function osher_fetch_tab(string $gid): array {
    $url = 'https://docs.google.com/spreadsheets/d/' . rawurlencode(OSHER_SHEET_ID) . '/export?format=csv&gid=' . $gid;
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
        error_log("osher-max refresh: sheet gid $gid HTTP $code $err");
        return [null, 'קריאת הטבלה נכשלה (' . ($err ?: "HTTP $code") . '). הנתונים הקודמים נשארו.'];
    }
    if (preg_match('/^\s*</', $csv)) {
        return [null, 'גוגל החזיר דף ולא טבלה: כנראה הטבלה לא משותפת לצפייה. הנתונים הקודמים נשארו.'];
    }
    return [$csv, null];
}

/**
 * קורא את הגיליון ובונה את הנתונים. מחזיר [קוד HTTP, תשובה]. בכל כשל הנתונים הקודמים נשארים כמו שהם.
 * התשובה כוללת רק ספירות, בלי נתונים.
 */
function osher_refresh(): array {
    $dataFile = osher_data_file();
    $dataDir = dirname($dataFile);
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0700, true)) return [500, ['ok' => false, 'error' => 'אין תיקיית נתונים']];

    // נעילה: רענון אחד בכל פעם. מי שמגיע באמצע מחכה, ומקבל את התוצאה של אותו רענון.
    $lock = fopen($dataDir . '/.refresh.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return [500, ['ok' => false, 'error' => 'נעילה נכשלה']];
    $meta = osher_current_meta($dataFile);
    $age = $meta['generatedAt'] ? time() - strtotime($meta['generatedAt']) : PHP_INT_MAX;
    if ($age < OSHER_MIN_GAP) return [200, ['ok' => true, 'reused' => true] + $meta];

    [$leadsCsv, $err] = osher_fetch_tab(OSHER_SHEET_GID);
    if ($err) return [502, ['ok' => false, 'error' => $err]];
    [$purchasesCsv, $err] = osher_fetch_tab(OSHER_PURCHASES_GID);
    if ($err) return [502, ['ok' => false, 'error' => $err]];
    // לשוניות הדיוורים לא חובה: כשהקריאה נכשלת הסקשן מוסתר, והשאר מתעדכן
    [$mailingsCsv] = osher_fetch_tab(OSHER_MAILINGS_GID);
    [$wavesCsv] = osher_fetch_tab(OSHER_WAVES_GID);

    try {
        $built = osher_build(osher_parse_csv($leadsCsv), osher_parse_csv($purchasesCsv), new DateTimeImmutable('now', new DateTimeZone('UTC')),
            $mailingsCsv !== null ? osher_parse_csv($mailingsCsv) : null, $wavesCsv !== null ? osher_parse_csv($wavesCsv) : null);
        $file = $built['file'];
    } catch (RuntimeException $e) {
        return [422, ['ok' => false, 'error' => $e->getMessage() . '. הנתונים הקודמים נשארו.']];
    }
    if (!$file['leads']) return [422, ['ok' => false, 'error' => 'לא נמצאו לידים בטבלה. הנתונים הקודמים נשארו.']];

    // הקודים המזהים קודם, ואז הנתונים: דף שרואה נתונים חדשים מוצא כבר את הקודים שלהם. כשל בקודים לא מפיל את הרענון
    $links = osher_write_private('ids.json', json_encode($built['ids'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    if (!osher_write_private('leads.json', osher_pack($file))) return [500, ['ok' => false, 'error' => 'שמירת הנתונים נכשלה']];
    return [200, [
        'ok' => true,
        'generatedAt' => $file['generatedAt'],
        'sheetRows' => $file['sheetRows'],
        'purchaseRows' => $file['purchaseRows'],
        'leads' => count($file['leads']),
        'purchases' => count($file['purchases']),
        'mailings' => $file['mailings'] === null ? null : count($file['mailings']),
        'mailingWaves' => $file['mailingWaves'] === null ? null : count($file['mailingWaves']),
        'links' => $links,
    ]];
}
