<?php
// בדיקת עזר: האם ייצוא לפי gid מחזיר גם שורות שמוסתרות בפילטר. ספירות בלבד.
require __DIR__ . '/lib.php';
function get(string $url): array { $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60]); $b = (string) curl_exec($ch); return [curl_getinfo($ch, CURLINFO_RESPONSE_CODE), $b]; }
function count_csv(string $csv): string { $f = fopen('php://temp', 'r+'); fwrite($f, $csv); rewind($f); $head = fgetcsv($f, null, ',', '"', '') ?: []; $ai = array_search("ענה לצ'אטבוט?", array_map('trim', $head), true); $n = 0; $a = 0; while (($r = fgetcsv($f, null, ',', '"', '')) !== false) { if (implode('', $r) === '') continue; $n++; if ($ai !== false && trim((string) ($r[$ai] ?? '')) !== '') $a++; } return "$n שורות, ענו $a, עמודות " . count($head); }
$base = 'https://docs.google.com/spreadsheets/d/' . SHEET_ID;
[$c, $html] = get("$base/htmlview");
preg_match_all('/gid=(\d+)[^>]*>([^<]{1,40})</u', $html, $m, PREG_SET_ORDER);
$gid = null; foreach ($m as $x) if (trim(html_entity_decode($x[2])) === SHEET_TAB) { $gid = $x[1]; break; }
echo "htmlview $c, gid של לידים: " . ($gid ?? 'לא נמצא') . ', לשוניות שנמצאו: ' . count($m) . "\n";
echo 'gviz לפי שם: ' . count_csv(get("$base/gviz/tq?tqx=out:csv&sheet=" . rawurlencode(SHEET_TAB))[1]) . "\n";
if ($gid) { [$c2, $csv] = get("$base/export?format=csv&gid=$gid"); echo "export לפי gid: HTTP $c2, " . count_csv($csv) . "\n"; }
