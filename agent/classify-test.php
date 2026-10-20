<?php
// בדיקת סיווג (#20): 20 שיחות עם תוכן, מפוזרות על כל התקופה. לא כותב לטבלה.
// התוצאות (מזהה, סוג, נימוק) יוצאות מוצפנות. בגלוי רק ספירות.
require __DIR__ . '/lib.php';
const WANT = 20; const MAX_FETCH = 45;
[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה'); $cDate = col_of($h, 'תאריך כניסה'); $cAns = col_of($h, "ענה לצ'אטבוט?");
$cand = [];
foreach ($rows as $r) {
    $ns = cell($r, $cNs); $d = parse_date(cell($r, $cDate));
    if ($ns !== '' && $d && cell($r, $cAns) !== '' && $d >= new DateTimeImmutable('2026-09-01')) $cand[$ns] ??= $d;
}
asort($cand);
$keys = array_keys($cand);
$stride = max(1, (int) ceil(count($keys) / WANT));   // פיזור על כל התקופה: 0, 17, 34... ואז 1, 18, 35...
$order = $keys;
uksort($order, fn($a, $b) => [$a % $stride, $a] <=> [$b % $stride, $b]);
$stats = ['נבדקו' => 0, 'עם תוכן' => 0, 'בלי תוכן' => 0, 'לא נמצאו בבוט' => 0];
$results = []; $tokens = 0; $types = [];
foreach ($order as $ns) {
    if (count($results) >= WANT || $stats['נבדקו'] >= MAX_FETCH) break;
    $stats['נבדקו']++;
    $msgs = conversation($ns);
    if ($msgs === null) { $stats['לא נמצאו בבוט']++; continue; }
    if (!has_content($msgs)) { $stats['בלי תוכן']++; continue; }
    $stats['עם תוכן']++;
    $s = sides($msgs);
    $c = classify(transcript($msgs));
    $tokens += $c['tokens']; $types[$c['type']] = ($types[$c['type']] ?? 0) + 1;
    $results[] = count($results) + 1 . ". {$ns} | נכנס {$cand[$ns]->format('d/m/Y')} | לקוח {$s['customer']}, בוט {$s['bot']} | {$c['type']} | {$c['reason']}";
}
echo 'שורות בטבלה: ' . count($rows) . ', מזהים שענו לבוט מספטמבר: ' . count($cand) . "\n";
echo 'מודל: ' . ai_model() . "\n";
echo 'ספירות: ' . json_encode($stats, JSON_UNESCAPED_UNICODE) . "\n";
echo 'סוגים: ' . json_encode($types, JSON_UNESCAPED_UNICODE) . "; טוקנים: $tokens\n";
echo "תוצאות מוצפנות:\n" . seal_for_review(implode("\n", $results));
