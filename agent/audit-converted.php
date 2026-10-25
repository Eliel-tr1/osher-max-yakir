<?php
// בדיקת converted (בקשת המנהל, 2026-10-25): לכל מזהה שמסומן converted בטבלה, האם הייתה שיחה עם הבוט
// לפני הרכישה, והאם הבוט שלח קישור לפני הרכישה. קריאה בלבד: לא כותב לטבלה ולא לבוט.
// מדפיס ספירות בלבד. הפירוט לכל מזהה (בלי תוכן הודעות) נשמר מוצפן ב-state/review-out.sealed.
// שימוש: php audit-converted.php [מגבלה]
declare(strict_types=1);
require __DIR__ . '/lib.php';

$GLOBALS['CC_GAP'] = 1.2;   // מהיר יותר מהסוכן הלילי, עדיין קריאה אחת בכל פעם. 429 מטופל ב-cc_get
$limit = (int) ($argv[1] ?? 0);
$state = agent_home() . '/state';
@mkdir($state, 0700, true);

/** לשונית שלמה בייצוא CSV. בניגוד ל-gviz, כולל גם שורות שמוסתרות בסינון. */
function sheet_export(string $gid): array {
    $ch = curl_init('https://docs.google.com/spreadsheets/d/' . SHEET_ID . '/export?format=csv&gid=' . $gid);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 120]);
    $csv = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($csv === false || $code !== 200 || str_starts_with(ltrim($csv), '<')) throw new RuntimeException("ייצוא הלשונית $gid נכשל ($code)");
    $f = fopen('php://temp', 'r+');
    fwrite($f, preg_replace('/^\xEF\xBB\xBF/', '', $csv));
    rewind($f);
    $head = array_map('trim', fgetcsv($f, null, ',', '"', '') ?: []);
    $rows = [];
    while (($r = fgetcsv($f, null, ',', '"', '')) !== false) if (implode('', array_map('trim', $r)) !== '') $rows[] = $r;
    return [$head, $rows];
}

function ts_of(array $m): int {
    $t = (int) ($m['ts'] ?? 0);
    return $t > 20000000000 ? intdiv($t, 1000) : $t;
}

/** קישורים בהודעה (כולל כפתורים), כ-host/נתיב ראשון, בלי פרמטרים. */
function link_keys(array $m): array {
    preg_match_all('#https?://[^\s"\'<>\\\\]+#u', json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $mm);
    $out = [];
    foreach ($mm[0] as $u) {
        $p = parse_url($u);
        if (empty($p['host'])) continue;
        $host = strtolower(preg_replace('/^www\./', '', $p['host']));
        if (str_contains($host, 'thecloud.chat') || str_contains($host, 'fbcdn') || str_contains($host, 'whatsapp.net')) continue;
        $seg = explode('/', trim($p['path'] ?? '', '/'))[0] ?? '';
        $out[$host . '/' . $seg] = true;
    }
    return array_keys($out);
}

/** תבנית התראה אוטומטית (למשל "HE client_notification_..._v2"), לא שיחה. */
function is_template(array $m): bool {
    return (bool) preg_match('/^(HE|EN)\s+[a-z0-9_]+_v\d+\s*$/i', msg_text($m));
}

$t0 = microtime(true);
[$lh, $lrows] = sheet_export('0');            // לידים
[$ph, $prows] = sheet_export('282711056');    // רכישות
$cNs = col_of($lh, 'קוד מזהה'); $cQ = col_of($lh, 'סטטוס שאלון'); $cAt = col_of($lh, 'תאריך כניסה'); $cAns = col_of($lh, "ענה לצ'אטבוט?");
$pNs = col_of($ph, 'קוד מזהה'); $pAt = col_of($ph, 'תאריך');

$conv = [];
foreach ($lrows as $r) {
    $ns = cell($r, $cNs);
    if ($ns === '' || strtolower(cell($r, $cQ)) !== 'converted') continue;
    $at = parse_date(cell($r, $cAt));
    $x = &$conv[$ns];
    $x ??= ['rowAt' => null, 'answered' => false, 'buys' => []];
    if ($at && (!$x['rowAt'] || $at < $x['rowAt'])) $x['rowAt'] = $at;
    if (cell($r, $cAns) === 'כן') $x['answered'] = true;
    unset($x);
}
foreach ($prows as $r) {
    $ns = cell($r, $pNs);
    if (isset($conv[$ns]) && ($d = parse_date(cell($r, $pAt)))) $conv[$ns]['buys'][] = $d->getTimestamp();
}
echo 'התחלה: ' . count($lrows) . ' שורות בלידים, ' . count($prows) . ' ברכישות, ' . count($conv) . " מזהים עם converted\n";

$sum = ['מזהים' => 0, 'לא נמצאו בבוט' => 0, 'שגיאה' => 0, 'היסטוריה חתוכה' => 0, 'בלי תאריך רכישה' => 0];
$hosts = [];
$detail = [];
$n = 0;
foreach ($conv as $ns => $x) {
    if ($limit && $n >= $limit) break;
    $n++;
    $sum['מזהים']++;
    sort($x['buys']);
    $T = $x['buys'][0] ?? ($x['rowAt'] ? $x['rowAt']->getTimestamp() : null);
    if (!$x['buys']) $sum['בלי תאריך רכישה']++;
    $d = ['ns' => $ns, 'T' => $T, 'buys' => count($x['buys']), 'I' => $x['answered']];
    try {
        $msgs = conversation($ns);
    } catch (RuntimeException $e) {
        $sum['שגיאה']++;
        $detail[] = $d + ['err' => mb_substr($e->getMessage(), 0, 60)];
        continue;
    }
    if ($msgs === null) { $sum['לא נמצאו בבוט']++; $detail[] = $d + ['nf' => 1]; continue; }
    $first = $msgs ? ts_of($msgs[0]) : null;
    $trunc = count($msgs) >= 100 && $T !== null && $first !== null && $first > $T;
    if ($trunc) $sum['היסטוריה חתוכה']++;
    // עד 10 דקות אחרי הרכישה נחשב "לפני": הפרש שעונים ורישום מאוחר בטבלה
    $cut = $T === null ? PHP_INT_MAX : $T + 600;
    $b = ['in' => 0, 'out' => 0, 'agent' => 0, 'tpl' => 0];
    $links = []; $firstIn = null; $lastIn = null; $firstLinkAt = null;
    foreach ($msgs as $m) {
        $ts = ts_of($m);
        if ($ts > $cut) continue;
        $type = $m['type'] ?? '';
        if ($type === 'in') { $b['in']++; $firstIn ??= $ts; $lastIn = $ts; }
        elseif ($type === 'out' || $type === 'agent') {
            if (is_template($m)) { $b['tpl']++; continue; }
            $b[$type]++;
            foreach (link_keys($m) as $k) {
                $links[$k] = ($links[$k] ?? 0) + 1;
                $hosts[$k] = ($hosts[$k] ?? 0) + 1;
                $firstLinkAt ??= $ts;
            }
        }
    }
    $d += ['n' => count($msgs), 'first' => $first, 'tr' => $trunc ? 1 : 0, 'b' => $b, 'fIn' => $firstIn, 'lIn' => $lastIn, 'links' => $links, 'fLink' => $firstLinkAt];
    $detail[] = $d;
    if ($n % 50 === 0) echo date('H:i:s') . " נבדקו $n\n";
}

// ספירה גסה לפי הודעות לפני הרכישה, רק כדי לראות את התמונה. הסיווג הסופי נעשה בדוח.
$buckets = ['אין הודעות לקוח לפני הרכישה' => 0, 'פחות מ-2 הודעות מכל צד' => 0, 'שיחה, בלי קישור מהבוט' => 0, 'שיחה עם קישור מהבוט' => 0];
foreach ($detail as $d) {
    if (!isset($d['b'])) continue;
    if ($d['b']['in'] === 0) $buckets['אין הודעות לקוח לפני הרכישה']++;
    elseif ($d['b']['in'] < MIN_EACH_SIDE || $d['b']['out'] + $d['b']['agent'] < MIN_EACH_SIDE) $buckets['פחות מ-2 הודעות מכל צד']++;
    elseif (!$d['links']) $buckets['שיחה, בלי קישור מהבוט']++;
    else $buckets['שיחה עם קישור מהבוט']++;
}
arsort($hosts);
file_put_contents("$state/review-out.sealed", seal_for_review(json_encode($detail, JSON_UNESCAPED_UNICODE)));
echo 'קישורים מהבוט לפני רכישה (host/נתיב): ' . json_encode(array_slice($hosts, 0, 15, true), JSON_UNESCAPED_UNICODE) . "\n";
echo 'סיום: ' . json_encode($sum + $buckets + ['דקות' => round((microtime(true) - $t0) / 60, 1)], JSON_UNESCAPED_UNICODE) . "\n";
