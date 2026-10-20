<?php
// סוכן ניתוח השיחות (#20): ההרצה עצמה.
//   php run.php [כמה]        קורא עד "כמה" שיחות (ברירת מחדל 50), מהישנה לחדשה, ושומר תוצאות בשרת
//   php run.php [כמה] --night  כמו למעלה, אבל רק בין 02:00 ל-06:00 (מ-cron, כל שעה)
// אחר כך כותב לטבלה את כל מה שממתין, אם יש SHEET_WRITER_URL ב-.env.
// בוחר: "ענה לצ'אטבוט?" מלא, "נקרא ב:" ריק, נכנס לפני היום, ועוד לא נקרא (גם לא ממתין לכתיבה).
// כותב: "אופן שיחה" (מכירתי/שירותי, רק לשיחה עם תוכן), "נימוק", "נקרא ב:". את "התחיל שיחה" לא נוגע.
// מדפיס רק ספירות.
require __DIR__ . '/lib.php';

$limit = (int) ($argv[1] ?? 50) ?: 50;
$night = in_array('--night', $argv, true);
$now = new DateTimeImmutable();
if ($night && ((int) $now->format('G') < 2 || (int) $now->format('G') >= 6)) exit(0);

$state = agent_home() . '/state';
@mkdir($state, 0700, true);
$lock = fopen("$state/run.lock", 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) { echo "הרצה אחרת עוד עובדת, יוצא\n"; exit(0); }
$pendingFile = "$state/pending.json"; $doneFile = "$state/done.json";
$pending = json_decode((string) @file_get_contents($pendingFile), true) ?: [];
$done = json_decode((string) @file_get_contents($doneFile), true) ?: [];
$save = function () use (&$pending, $pendingFile) { file_put_contents("$pendingFile.tmp", json_encode($pending, JSON_UNESCAPED_UNICODE)); rename("$pendingFile.tmp", $pendingFile); };

[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה'); $cDate = col_of($h, 'תאריך כניסה'); $cAns = col_of($h, "ענה לצ'אטבוט?"); $cRead = col_of($h, 'נקרא ב:');
col_of($h, 'אופן שיחה'); col_of($h, 'נימוק');
$today = $now->setTime(0, 0);
$cand = [];
foreach ($rows as $r) {
    $ns = cell($r, $cNs); $d = parse_date(cell($r, $cDate));
    if ($ns === '' || !$d || cell($r, $cAns) === '' || cell($r, $cRead) !== '' || $d >= $today) continue;
    if (isset($pending[$ns]) || isset($done[$ns])) continue;
    if (!isset($cand[$ns]) || $d < $cand[$ns]) $cand[$ns] = $d;
}
asort($cand);
echo date('H:i:s') . ' התחלה: ' . count($rows) . " שורות בטבלה\n";
$stats = ['שורות בטבלה' => count($rows), 'ממתינות לקריאה' => count($cand), 'נקראו' => 0, 'מכירתי' => 0, 'שירותי' => 0, 'בלי תוכן' => 0, 'לא נמצאו בבוט' => 0];
$stopAt = $night ? $now->setTime(5, 55) : null;
foreach (array_keys($cand) as $ns) {
    if ($stats['נקראו'] >= $limit || ($stopAt && new DateTimeImmutable() >= $stopAt)) break;
    $msgs = conversation($ns);
    $readAt = (new DateTimeImmutable())->format(DATE_ATOM);
    $stats['נקראו']++;
    if ($msgs === null) { $pending[$ns] = ['type' => '', 'reason' => 'השיחה לא נמצאה בבוט', 'readAt' => $readAt]; $stats['לא נמצאו בבוט']++; }
    elseif (!has_content($msgs)) { $pending[$ns] = ['type' => '', 'reason' => 'שיחה בלי תוכן', 'readAt' => $readAt]; $stats['בלי תוכן']++; }
    else {
        $c = classify(transcript($msgs));
        $pending[$ns] = ['type' => $c['type'], 'reason' => $c['reason'], 'readAt' => $readAt];
        $stats[$c['type']]++;
    }
    $save();
    if ($stats['נקראו'] % 10 === 0) echo date('H:i:s') . " נקראו {$stats['נקראו']}\n";
}

// כתיבה לטבלה
$written = 0; $missing = 0;
if ($pending && env_has('SHEET_WRITER_URL')) {
    foreach (array_chunk($pending, 100, true) as $chunk) {
        $updates = [];
        foreach ($chunk as $ns => $v) $updates[] = ['ns' => $ns] + $v;
        $res = sheet_write($updates);
        foreach ($chunk as $ns => $v) { $done[$ns] = $v['readAt']; unset($pending[$ns]); }
        $written += (int) $res['updated']; $missing += count($res['missing'] ?? []);
        $save();
        file_put_contents("$doneFile.tmp", json_encode($done)); rename("$doneFile.tmp", $doneFile);
    }
}
$stats['שורות שנכתבו לטבלה'] = $written;
if ($missing) $stats['מזהים שלא נמצאו בטבלה בזמן הכתיבה'] = $missing;
$stats['ממתינות לכתיבה'] = count($pending);
echo 'סיום: ' . json_encode($stats, JSON_UNESCAPED_UNICODE) . "\n";
