<?php
// מכבה את הסוכן הלילי (החלטת המנהל, 2026-10-29): מסיר מ-crontab רק את השורה שלו ואת ההערה שמעליה.
// לא נוגע במשימות אחרות ולא מוחק קבצים. השורה שהוסרה נשמרת ב-state, כדי שאפשר יהיה להחזיר אותה.
// מדווח מתי הסוכן רץ לאחרונה ומה עשה. ספירות ותאריכים בלבד.
require __DIR__ . '/lib.php';

$state = agent_home() . '/state';
$isTask = fn(string $l) => trim($l) !== '' && !str_starts_with(ltrim($l), '#');
$before = (string) shell_exec('crontab -l 2>/dev/null');
$lines = $before === '' ? [] : explode("\n", rtrim($before, "\n"));
$keep = [];
$removed = [];
foreach ($lines as $l) {
    if (str_contains($l, 'osher-max-agent/app && php run.php') || trim($l) === '# סוכן ניתוח השיחות של אושר מקס (#20)') $removed[] = $l;
    else $keep[] = $l;
}
$othersBefore = count(array_filter($keep, $isTask));
if (!array_filter($removed, $isTask)) {
    echo "cron: השורה של הסוכן כבר לא קיימת. משימות אחרות ב-crontab: $othersBefore\n";
} else {
    $saved = "$state/cron-removed-" . date('Ymd-His') . '.txt';
    file_put_contents($saved, implode("\n", $removed) . "\n");
    $tmp = tempnam(sys_get_temp_dir(), 'cron');
    file_put_contents($tmp, $keep ? implode("\n", $keep) . "\n" : '');
    exec('crontab ' . escapeshellarg($tmp) . ' 2>&1', $o, $rc);
    unlink($tmp);
    $after = (string) shell_exec('crontab -l 2>/dev/null');
    $othersAfter = count(array_filter(explode("\n", $after), $isTask));
    $ok = $rc === 0 && !str_contains($after, 'osher-max-agent/app && php run.php') && $othersAfter === $othersBefore;
    echo ($ok ? 'cron: הוסר' : 'cron: נכשל ' . implode(' ', $o)) . ". משימות אחרות לפני: $othersBefore, אחרי: $othersAfter. השורה שהוסרה נשמרה ב-state/" . basename($saved) . "\n";
}

// מתי רץ לאחרונה ומה עשה
$t = fn(string $f) => is_file($f) ? date('Y-m-d H:i:s', filemtime($f)) : 'אין קובץ';
echo 'קבצים: night.log עודכן ' . $t("$state/night.log") . ', pending.json עודכן ' . $t("$state/pending.json") . ', last-run.log עודכן ' . $t("$state/last-run.log") . "\n";
$night = @file("$state/night.log", FILE_IGNORE_NEW_LINES) ?: [];
$runs = [];
foreach ($night as $l) {
    if (preg_match('/^\d\d:\d\d:\d\d התחלה/u', $l)) $runs[] = [$l, null];
    elseif (str_starts_with($l, 'סיום') && $runs) $runs[count($runs) - 1][1] = $l;
}
echo 'הרצות בלוג: ' . count($runs) . ". 4 האחרונות:\n";
foreach (array_slice($runs, -4) as [$start, $end]) echo "- $start | " . ($end ?? 'בלי סיום') . "\n";
$pending = json_decode((string) @file_get_contents("$state/pending.json"), true) ?: [];
$byDay = [];
foreach ($pending as $v) {
    $d = substr((string) ($v['readAt'] ?? ''), 0, 10);
    $byDay[$d] = ($byDay[$d] ?? 0) + 1;
}
ksort($byDay);
echo 'סיווגים שממתינים בשרת ולא נכתבו לטבלה: ' . count($pending) . ', לפי יום הקריאה: ' . json_encode($byDay) . "\n";
$files = [];
foreach (['app', 'state'] as $dir) foreach (glob(agent_home() . "/$dir/*") ?: [] as $f) $files[] = "$dir/" . basename($f);
echo 'הקבצים נשארו (' . count($files) . '): ' . implode(', ', $files) . "\n";
