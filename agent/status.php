<?php
// מצב הסוכן: כמה ממתינות לכתיבה, כמה נכתבו, וסוף הלוג של ההרצה האחרונה. ספירות בלבד.
require __DIR__ . '/lib.php';
$s = agent_home() . '/state';
$pending = json_decode((string) @file_get_contents("$s/pending.json"), true) ?: [];
$done = json_decode((string) @file_get_contents("$s/done.json"), true) ?: [];
$types = array_count_values(array_map(fn($v) => $v['type'] !== '' ? $v['type'] : $v['reason'], $pending));
echo 'ממתינות לכתיבה: ' . count($pending) . ' ' . json_encode($types, JSON_UNESCAPED_UNICODE) . '; נכתבו: ' . count($done) . "\n";
$log = @file("$s/last-run.log", FILE_IGNORE_NEW_LINES) ?: [];
echo 'לוג אחרון: ' . implode(' / ', array_slice($log, -3)) . "\n";
$night = @file("$s/night.log", FILE_IGNORE_NEW_LINES) ?: [];
$keep = array_values(array_filter($night, fn($l) => preg_match('/^(התחלה|סיום|PHP|Fatal|.*Exception|.*חלון)/u', $l)));
echo 'לילות (' . count($night) . ' שורות בלוג): ' . implode(' / ', array_slice($keep, -12)) . "\n";
$cron = array_filter(explode("\n", (string) shell_exec('crontab -l 2>/dev/null')), fn($l) => str_contains($l, 'osher-max-agent'));
echo 'cron: ' . count($cron) . ' שורות של הסוכן' . "\n";
