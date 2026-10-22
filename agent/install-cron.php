<?php
// מתקין (פעם אחת, בלי לגעת במשימות אחרות) הרצה כל שעה. run.php --night עובד רק בין 02:00 ל-06:00 שעון ישראל.
$line = '7 * * * * cd $HOME/osher-max-agent/app && php run.php 50 --night >> $HOME/osher-max-agent/state/night.log 2>&1';
$current = (string) shell_exec('crontab -l 2>/dev/null');
if (str_contains($current, 'osher-max-agent/app && php run.php')) { echo "כבר מותקן\n"; exit(0); }
$tmp = tempnam(sys_get_temp_dir(), 'cron');
file_put_contents($tmp, rtrim($current) . ($current !== '' ? "\n" : '') . "# סוכן ניתוח השיחות של אושר מקס (#20)\n$line\n");
exec('crontab ' . escapeshellarg($tmp) . ' 2>&1', $o, $rc);
unlink($tmp);
$after = (string) shell_exec('crontab -l 2>/dev/null');
echo ($rc === 0 && str_contains($after, 'php run.php 50 --night') ? 'הותקן' : 'נכשל: ' . implode(' ', $o)) . '. משימות ב-crontab: ' . count(array_filter(explode("\n", $after), fn($l) => trim($l) !== '' && $l[0] !== '#')) . "\n";
