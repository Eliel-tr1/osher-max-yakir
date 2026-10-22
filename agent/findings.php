<?php
// ממצאים (#20): הסיווגים שנשמרו בשרת מול מה שקרה בפועל בטבלה. ספירות בלבד.
require __DIR__ . '/lib.php';
$s = agent_home() . '/state';
$res = (json_decode((string) @file_get_contents("$s/pending.json"), true) ?: []) + array_map(fn($t) => ['type' => '?', 'readAt' => $t], json_decode((string) @file_get_contents("$s/done.json"), true) ?: []);
[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה'); $cQ = col_of($h, 'סטטוס שאלון'); $cRes = col_of($h, 'סטטוס'); $cAns = col_of($h, "ענה לצ'אטבוט?"); $cRead = col_of($h, 'נקרא ב:'); $cAmt = col_of($h, 'סכום ששולם');
$byNs = [];
foreach ($rows as $r) {
    $ns = cell($r, $cNs); if ($ns === '') continue;
    $x = &$byNs[$ns]; $x ??= ['q' => '', 'res' => '', 'amt' => 0.0];
    $q = strtolower(cell($r, $cQ)); if ($q === 'converted' || ($q === 'payment' && $x['q'] !== 'converted') || $x['q'] === '') $x['q'] = $q;
    if (cell($r, $cRes) !== '') $x['res'] = cell($r, $cRes);
    $x['amt'] = max($x['amt'], (float) preg_replace('/[^\d.]/', '', cell($r, $cAmt)));
    unset($x);
}
$t = [];
foreach ($res as $ns => $v) {
    $type = $v['type'] !== '' ? $v['type'] : 'בלי תוכן או לא נמצא';
    $x = $byNs[$ns] ?? null;
    $t[$type] ??= ['שיחות' => 0, 'לא בטבלה עכשיו' => 0, 'converted' => 0, 'payment' => 0, 'לא רכשו' => 0, 'סכום' => 0, 'עבר' => 0, 'לא עבר' => 0];
    $t[$type]['שיחות']++;
    if (!$x) { $t[$type]['לא בטבלה עכשיו']++; continue; }
    if ($x['q'] === 'converted') $t[$type]['converted']++; elseif ($x['q'] === 'payment') $t[$type]['payment']++; else $t[$type]['לא רכשו']++;
    if (in_array($x['q'], ['converted', 'payment'], true)) $t[$type]['סכום'] += $x['amt'];
    if ($x['res'] === 'עבר') $t[$type]['עבר']++; elseif ($x['res'] === 'לא עבר') $t[$type]['לא עבר']++;
}
$answered = 0; $readInSheet = 0; $unread = 0;
$now = new DateTimeImmutable(); $cDate = col_of($h, 'תאריך כניסה'); $seen = [];
foreach ($rows as $r) { $ns = cell($r, $cNs); if (cell($r, $cAns) === '' || isset($seen[$ns])) continue; $seen[$ns] = 1; $answered++; if (cell($r, $cRead) !== '') $readInSheet++; elseif (!isset($res[$ns])) $unread++; }
echo 'שורות בטבלה: ' . count($rows) . "; מזהים שענו לבוט: $answered; עם 'נקרא ב:' בטבלה: $readInSheet; שמורים בשרת: " . count($res) . "; ענו ועוד לא נקראו: $unread\n";
foreach ($t as $type => $v) { $v['סכום'] = round($v['סכום']); echo "$type: " . json_encode($v, JSON_UNESCAPED_UNICODE) . "\n"; }
echo 'cron: ' . (trim((string) shell_exec('crontab -l 2>/dev/null | grep -c osher-max-agent')) ?: '0') . " משימות של הסוכן\n";
