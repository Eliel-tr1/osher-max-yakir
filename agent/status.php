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
