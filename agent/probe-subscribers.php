<?php
// בדיקה (28/10): כמה רשומים יש בבוט מול כמה מזהים יש בטבלה, ומי חסר. ספירות בלבד, בלי פרטים אישיים.
// עד 60 קריאות לבוט (100 רשומים בכל עמוד).
require __DIR__ . '/lib.php';

$GLOBALS['CC_GAP'] = 1.0;
[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה');
$inSheet = [];
foreach ($rows as $r) if (($ns = cell($r, $cNs)) !== '') $inSheet[$ns] = true;

$total = null; $seen = 0; $pages = 0; $missing = 0; $byMonth = []; $missingByMonth = []; $keys = []; $sample = null;
for ($page = 1; $page <= 60; $page++) {
    $res = cc_get('/subscribers', ['page' => $page, 'limit' => 100]);
    if ($res['code'] !== 200) { echo "עמוד $page: HTTP {$res['code']}\n"; break; }
    $j = $res['json'];
    $data = $j['data'] ?? [];
    if ($page === 1) {
        $keys = array_keys($j);
        $total = $j['total'] ?? ($j['meta']['total'] ?? ($j['pagination']['total'] ?? null));
        $sample = is_array($data[0] ?? null) ? array_keys($data[0]) : [];
    }
    if (!$data) break;
    $pages++;
    foreach ($data as $s) {
        $seen++;
        $ns = (string) ($s['user_ns'] ?? $s['ns'] ?? '');
        $created = (string) ($s['created_at'] ?? $s['subscribed_at'] ?? $s['created'] ?? '');
        $m = preg_match('/(\d{4})-(\d{2})/', $created, $mm) ? "$mm[1]-$mm[2]" : (preg_match('/^(\d{9,11})$/', $created) ? date('Y-m', (int) $created) : '?');
        $byMonth[$m] = ($byMonth[$m] ?? 0) + 1;
        if ($ns !== '' && !isset($inSheet[$ns])) { $missing++; $missingByMonth[$m] = ($missingByMonth[$m] ?? 0) + 1; }
    }
    if (count($data) < 100) break;
}
ksort($byMonth); ksort($missingByMonth);
echo 'מפתחות בתשובה: ' . implode(',', $keys) . ' | שדות של רשום: ' . implode(',', array_slice($sample ?? [], 0, 25)) . "\n";
echo 'סיום: ' . json_encode(['סך הכול לפי ה-API' => $total, 'נקראו' => $seen, 'עמודים' => $pages, 'מזהים בטבלה' => count($inSheet), 'רשומים שלא בטבלה' => $missing, 'לפי חודש' => $byMonth, 'חסרים לפי חודש' => $missingByMonth], JSON_UNESCAPED_UNICODE) . "\n";
