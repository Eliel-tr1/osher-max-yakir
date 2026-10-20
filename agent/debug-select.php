<?php
// בדיקת עזר: טווח התאריכים והמילוי של השורות שבלשונית עכשיו. ספירות בלבד.
require __DIR__ . '/lib.php';
[$h, $rows] = sheet_rows();
$cDate = col_of($h, 'תאריך כניסה');
$days = [];
foreach ($rows as $r) if ($d = parse_date(cell($r, $cDate))) $days[$d->format('Y-m-d')] = ($days[$d->format('Y-m-d')] ?? 0) + 1;
ksort($days);
echo count($rows) . ' שורות. לפי יום: ' . implode(', ', array_map(fn($k, $v) => substr($k, 8, 2) . '/' . substr($k, 5, 2) . ": $v", array_keys($days), $days)) . "\n";
$filled = [];
foreach ($h as $i => $name) { $n = 0; foreach ($rows as $r) if (cell($r, $i) !== '') $n++; if ($n) $filled[] = "$name $n"; }
echo 'עמודות מלאות: ' . implode('; ', $filled) . "\n";
