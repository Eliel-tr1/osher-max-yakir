<?php
// בדיקת עזר: כמה שורות מחזירה כל דרך קריאה של הלשונית. ספירות בלבד.
require __DIR__ . '/lib.php';
function fetch_count(string $url): string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60]);
    $csv = (string) curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $f = fopen('php://temp', 'r+'); fwrite($f, $csv); rewind($f);
    $n = -1; $ans = 0; $head = fgetcsv($f, null, ',', '"', '') ?: []; $ai = array_search("ענה לצ'אטבוט?", array_map('trim', $head), true);
    while (($r = fgetcsv($f, null, ',', '"', '')) !== false) { $n++; if ($ai !== false && trim((string) ($r[$ai] ?? '')) !== '') $ans++; }
    return "HTTP $code, " . ($n + 1) . " שורות, ענו $ans, עמודות " . count($head);
}
$base = 'https://docs.google.com/spreadsheets/d/' . SHEET_ID;
echo 'gviz לפי שם: ' . fetch_count("$base/gviz/tq?tqx=out:csv&sheet=" . rawurlencode(SHEET_TAB)) . "\n";
echo 'gviz לפי gid 1013261369: ' . fetch_count("$base/gviz/tq?tqx=out:csv&gid=1013261369") . "\n";
echo 'export לפי gid 1013261369: ' . fetch_count("$base/export?format=csv&gid=1013261369") . "\n";
