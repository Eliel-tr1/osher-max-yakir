<?php
// בדיקה ראשונה (#20): המבנה של כמה שיחות, בלי תוכן. עד 7 קריאות לבוט.
require __DIR__ . '/lib.php';

[$h, $rows] = sheet_rows();
$cNs = col_of($h, 'קוד מזהה'); $cPhone = col_of($h, 'טלפון'); $cDate = col_of($h, 'תאריך כניסה'); $cAns = col_of($h, "ענה לצ'אטבוט?");
$byNs = []; $nsOfPhone = [];
foreach ($rows as $r) {
    $ns = cell($r, $cNs); $d = parse_date(cell($r, $cDate));
    if ($ns === '' || !$d) continue;
    $ph = substr(preg_replace('/\D/', '', cell($r, $cPhone)), -9);
    $byNs[$ns] ??= ['date' => $d, 'ans' => false, 'phone' => $ph];
    if (cell($r, $cAns) !== '') $byNs[$ns]['ans'] = true;
    if ($ph !== '') $nsOfPhone[$ph][$ns] = true;
}
$ans = array_filter($byNs, fn($x) => $x['ans']);
uasort($ans, fn($a, $b) => $a['date'] <=> $b['date']);
$keys = array_keys($ans);
$pick = [];
foreach (array_slice($keys, 0, 2) as $k) $pick[$k] = 'הכי ישנה';
foreach (array_slice($keys, (int) (count($keys) / 2), 1) as $k) $pick[$k] = 'אמצע';
foreach (array_slice($keys, -3, 2) as $k) $pick[$k] = 'חדשה';
foreach ($ans as $k => $x) {          // טלפון עם כמה מזהים: גם המזהה האחר שלו, אם יש
    if (count($nsOfPhone[$x['phone']] ?? []) > 1 && !isset($pick[$k])) {
        $pick[$k] = 'טלפון עם כמה מזהים';
        foreach (array_keys($nsOfPhone[$x['phone']]) as $o) if ($o !== $k) { $pick[$o] = 'המזהה האחר של אותו טלפון'; break; }
        break;
    }
}
echo "שורות שענו לבוט: " . count($ans) . " מזהים. נבדקות " . count($pick) . " שיחות, בלי תוכן.\n";
$n = 0;
foreach ($pick as $ns => $label) {
    $n++;
    $x = $byNs[$ns];
    $res = cc_get('/subscriber/chat-messages', ['user_ns' => $ns, 'include_bot' => 1, 'limit' => 100]);
    $msgs = $res['json']['data'] ?? null;
    $line = "$n. $label, נכנס " . $x['date']->format('d/m/Y') . ($x['ans'] ? '' : ' (לא ענה לבוט)') . ": HTTP {$res['code']}";
    if (!is_array($msgs)) {
        $line .= ', אין data. מפתחות בתשובה: ' . implode(',', array_keys((array) $res['json']));
    } else {
        $types = array_count_values(array_map(fn($m) => (string) ($m['type'] ?? '?'), $msgs));
        $kinds = array_count_values(array_map(fn($m) => (string) ($m['msg_type'] ?? '?'), $msgs));
        $ts = array_filter(array_map(fn($m) => (int) ($m['ts'] ?? 0), $msgs));
        $line .= ', ' . count($msgs) . ' הודעות' . (count($msgs) >= 100 ? ' (הגיע לתקרה 100)' : '');
        $line .= '; ממי: ' . json_encode($types, JSON_UNESCAPED_UNICODE) . '; סוג: ' . json_encode($kinds, JSON_UNESCAPED_UNICODE);
        if ($ts) $line .= '; מ-' . date('d/m/Y', min($ts)) . ' עד ' . date('d/m/Y', max($ts));
        if ($ts && count($ts) > 1) $line .= '; סדר: ' . ($ts[array_key_first($ts)] <= $ts[array_key_last($ts)] ? 'מהישנה לחדשה' : 'מהחדשה לישנה');
        $inLens = array_map(fn($m) => mb_strlen((string) ($m['content'] ?? $m['payload']['text'] ?? '')), array_filter($msgs, fn($m) => ($m['type'] ?? '') === 'in'));
        if ($inLens) $line .= '; אורך הודעות הלקוח: ממוצע ' . round(array_sum($inLens) / count($inLens)) . ' תווים';
        if ($n === 1 && $msgs) $line .= '; שדות בהודעה: ' . implode(',', array_keys($msgs[0]));
    }
    if ($res['limits']) $line .= '; כותרות מגבלה: ' . json_encode($res['limits']);
    echo $line . "\n";
}
