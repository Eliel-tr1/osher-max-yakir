<?php
// בדיקת עזר: כמה שורות עוברות כל שלב בסינון. ספירות בלבד.
require __DIR__ . '/lib.php';
[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה'); $cDate = col_of($h, 'תאריך כניסה'); $cAns = col_of($h, "ענה לצ'אטבוט?");
$n = ['rows' => count($rows), 'ns' => 0, 'date' => 0, 'ans' => 0, 'after_sep' => 0];
$cut = new DateTimeImmutable('2026-09-01');
foreach ($rows as $r) {
    $ns = cell($r, $cNs); $d = parse_date(cell($r, $cDate));
    if ($ns !== '') $n['ns']++;
    if ($d) $n['date']++;
    if (cell($r, $cAns) !== '') $n['ans']++;
    if ($d && $d >= $cut) $n['after_sep']++;
}
echo json_encode($n) . "\n" . 'PHP ' . PHP_VERSION . ', cut ' . $cut->format('c') . "\n";
$samples = array_slice(array_filter(array_map(fn($r) => preg_replace('/\d/', '9', cell($r, $cDate)), $rows)), 0, 3);
echo 'date formats: ' . implode(' | ', array_unique($samples)) . "\n";
