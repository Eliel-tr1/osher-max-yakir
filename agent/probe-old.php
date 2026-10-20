<?php
// בדיקה (#20): האם שיחות מלפני יותר מחודש עוד זמינות, וכמה מזהים לא נמצאים בבוט. בלי תוכן. עד 6 קריאות.
require __DIR__ . '/lib.php';
[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה'); $cDate = col_of($h, 'תאריך כניסה'); $cAns = col_of($h, "ענה לצ'אטבוט?");
$cand = [];
foreach ($rows as $r) {
    $d = parse_date(cell($r, $cDate)); $ns = cell($r, $cNs);
    if ($d && $ns !== '' && cell($r, $cAns) !== '' && $d >= new DateTimeImmutable('2026-09-01') && $d < new DateTimeImmutable('2026-09-16')) $cand[$ns] = $d;
}
asort($cand);
echo "שורות שענו לבוט בין 01/09 ל-15/09: " . count($cand) . " מזהים\n";
$keys = array_keys($cand);
$pick = array_unique(array_merge(array_slice($keys, 0, 2), array_slice($keys, (int) (count($keys) / 2), 2), array_slice($keys, -2)));
foreach ($pick as $i => $ns) {
    $res = cc_get('/subscriber/chat-messages', ['user_ns' => $ns, 'include_bot' => 1, 'limit' => 100]);
    $msgs = $res['json']['data'] ?? null;
    $line = ($i + 1) . '. נכנס ' . $cand[$ns]->format('d/m/Y') . ": HTTP {$res['code']}";
    if (is_array($msgs)) {
        $ts = array_filter(array_map(fn($m) => (int) ($m['ts'] ?? 0), $msgs));
        $line .= ', ' . count($msgs) . ' הודעות' . ($ts ? ', מ-' . date('d/m/Y', min($ts)) . ' עד ' . date('d/m/Y', max($ts)) : '');
    } else {
        $line .= ', ' . mb_substr((string) ($res['json']['message'] ?? ''), 0, 80);
    }
    echo $line . '; נשארו ' . ($res['limits']['x-ratelimit-remaining'] ?? '?') . "\n";
}
