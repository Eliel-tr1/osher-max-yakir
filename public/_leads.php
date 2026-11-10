<?php
/**
 * מהטבלה ללידים ולרכישות, בשרת. תרגום של lib/sheet/parse.ts ו-lib/leads/fromSheet.ts ו-lib/leads/file.ts (pack).
 * המקור הוא קוד ה-TypeScript. בדיקה בגיטהאב (tests/parity.test.ts) מריצה את שניהם על אותן טבלאות
 * ודורשת תוצאה זהה, כך ששינוי באחד בלי השני נכשל.
 * הקובץ מגדיר פונקציות בלבד. גישה ישירה אליו מהדפדפן לא עושה כלום.
 */

const OSHER_REQUIRED = ['תאריך כניסה', 'קוד מזהה', 'מקור הגעה', 'סטטוס', 'הסיר את עצמו?', "ענה לצ'אטבוט?",
    'שלב בשאלון', 'סטטוס שאלון', 'שם תהליך', 'ניקוד לקוח', 'מבחן', 'מוצר שנקנה', 'סכום ששולם'];
const OSHER_OPTIONAL = ['התחיל שיחה', 'אופן שיחה', 'utm_campaign', 'הודעות לקוח', 'קופון הבוט', 'תאריך קופון'];
const OSHER_MAILING = ['קמפיין', 'גל', 'תאריך שליחה', 'תאריך רכישה', 'קוד מזהה', 'מוצר', 'סכום', 'דרך קישור הקמפיין', 'קופון', 'של הבוט', 'סיבה'];
const OSHER_MAILING_WAVE = ['קמפיין', 'גל', 'תאריך שליחה', 'נשלחו', 'לא נמסרו (WhatsApp)', 'נמסרו', 'קונים', 'רכישות', 'סכום',
    'רכישות דרך הקישור', 'סכום דרך הקישור', 'רכישות עם SPOOKY', 'של הבוט = כן', 'הערה'];
const OSHER_BOT_COUPON_GROUP = 'קופון אישי של הבוט';
const OSHER_PURCHASE_REQUIRED = ['תאריך', 'קוד מזהה', 'מקור הגעה', 'מוצר שנקנה', 'סכום ששולם'];
const OSHER_START_DAY = '2026-09-01';
const OSHER_TEST_PRODUCT = '/בדיק|\btest\b/iu';
const OSHER_PURCHASE_DUP_SECONDS = 120;
const OSHER_BOT_SOURCE = 'בוט וואטסאפ';
const OSHER_BOT_YES = 'כן';
const OSHER_SITE_SOURCE = 'מהאתר (מבחן או רכישה)';
// תובנות שיחה (3/11/2026), כמו ANALYSIS_COLUMNS ושאר הקבועים ב-fromSheet.ts
const OSHER_ANALYSIS = ['קוד מזהה', 'תאריך כניסה', 'מסלול', 'קנה', 'שלב אחרון', 'סיבת נטישה'];
const OSHER_QUESTIONS = ['שאלה', 'מופעים'];
const OSHER_INQUIRIES = ['תאריך פניה', 'מזהה לקוח', 'קטגוריה'];
const OSHER_FEEDBACK = ['תאריך', 'קוד מזהה', 'קטגוריה'];
// "נקודות עצירה" (10/11/2026, #38), כמו STALL_COLUMNS
const OSHER_STALLS = ['קוד מזהה', 'תאריך כניסה', 'נקודת עצירה'];
const OSHER_INSIGHTS_START_DAY = '2026-10-02';
const OSHER_TEXT_MAX = 600;

function osher_trim(string $s): string {
    // כמו String.prototype.trim של JS: רווחים ב-Unicode, NBSP ו-BOM
    return preg_replace('/(*UCP)^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $s) ?? trim($s);
}

/** CSV לפי RFC 4180, כמו parseCsv */
function osher_parse_csv(string $text): array {
    $text = preg_replace('/^\x{FEFF}/u', '', $text);
    $rows = [];
    $row = [];
    $cell = '';
    $quoted = false;
    $n = strlen($text);
    for ($i = 0; $i < $n; $i++) {
        $c = $text[$i];
        if ($quoted) {
            if ($c === '"') {
                if ($i + 1 < $n && $text[$i + 1] === '"') { $cell .= '"'; $i++; } else { $quoted = false; }
            } else {
                $cell .= $c;
            }
        } elseif ($c === '"') {
            $quoted = true;
        } elseif ($c === ',') {
            $row[] = $cell; $cell = '';
        } elseif ($c === "\n" || $c === "\r") {
            if ($c === "\r" && $i + 1 < $n && $text[$i + 1] === "\n") $i++;
            $row[] = $cell; $rows[] = $row; $row = []; $cell = '';
        } else {
            $cell .= $c;
        }
    }
    if ($cell !== '' || count($row)) { $row[] = $cell; $rows[] = $row; }
    return $rows;
}

/** "30/09/2026 10:09:41" בשעון ישראל -> DateTimeImmutable ב-UTC, או null */
function osher_parse_date(string $value): ?DateTimeImmutable {
    if (!preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/', osher_trim($value), $m)) return null;
    [$d, $mo, $y] = [(int) $m[1], (int) $m[2], (int) $m[3]];
    $h = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 0;
    $mi = isset($m[5]) && $m[5] !== '' ? (int) $m[5] : 0;
    $s = isset($m[6]) && $m[6] !== '' ? (int) $m[6] : 0;
    if (!checkdate($mo, $d, $y) || $h > 23 || $mi > 59 || $s > 59) return null;
    $dt = new DateTimeImmutable(sprintf('%04d-%02d-%02d %02d:%02d:%02d', $y, $mo, $d, $h, $mi, $s), new DateTimeZone('Asia/Jerusalem'));
    return $dt->setTimezone(new DateTimeZone('UTC'));
}

/** כמו israelDayStart: חצות של היום בשעון ישראל, כחותמת זמן */
function osher_day_start(string $day): int {
    return (new DateTimeImmutable("$day 00:00:00", new DateTimeZone('Asia/Jerusalem')))->getTimestamp();
}

function osher_iso(DateTimeImmutable $d): string {
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
}

/** מספר כמו Number() של JS, עבור מה שמגיע מהטבלה */
function osher_number(string $v) {
    if ($v === '' || !is_numeric($v)) return null;
    $f = (float) $v;
    return floor($f) == $f && abs($f) < 1e15 ? (int) $f : $f;
}

function osher_amount(string $v) {
    $c = preg_replace('/[^\d.]/', '', $v);
    if ($c === '' || $c === '.') return null;
    return osher_number($c);
}

function osher_clean(?string $v): ?string {
    if ($v === null || $v === '') return null;
    $t = osher_trim(preg_replace('/(*UCP)\s+/u', ' ', preg_replace('/<[^>]*>/', '', $v)));
    return $t === '' || $t === '-' ? null : $t;
}

/** כמו yesNo: ריק -> null, שלילה -> 'no', אחרת 'yes' */
function osher_yes_no(string $v): ?string {
    $t = osher_trim($v);
    if ($t === '') return null;
    return preg_match('/^(לא|no|false|0)$/iu', $t) ? 'no' : 'yes';
}

/** כמו botFlag: "כן" בדיוק -> 'yes', ריק -> null, אחר -> 'no'. הערך כבר בלי רווחים בקצוות */
function osher_bot_flag(string $v): ?string {
    if ($v === '') return null;
    return $v === OSHER_BOT_YES ? 'yes' : 'no';
}

/** כמו clip: טקסט נקי, עד OSHER_TEXT_MAX תווים */
function osher_clip(string $v): string {
    $t = osher_clean($v);
    if ($t === null) return '';
    return mb_strlen($t, 'UTF-8') > OSHER_TEXT_MAX ? mb_substr($t, 0, OSHER_TEXT_MAX, 'UTF-8') . '…' : $t;
}

/** כמו yesNoExact: "כן" -> yes, "לא" -> no, אחר -> null */
function osher_yes_no_exact(string $v): ?string {
    $t = osher_trim($v);
    return $t === 'כן' ? 'yes' : ($t === 'לא' ? 'no' : null);
}

/** כמו couponCode: JSON או טקסט, אותיות גדולות, ריק / "-" / empty = null, קופון אישי של הבוט = הקבוצה */
function osher_coupon_code(string $v): ?string {
    $t = osher_trim($v);
    if (strncmp($t, '{', 1) === 0) {
        $j = json_decode($t, true);
        if ($j !== null || $t === 'null') {
            $t = is_array($j) && isset($j['code']) && is_string($j['code']) ? $j['code'] : '';
        }
    }
    $t = mb_strtoupper(osher_trim($t), 'UTF-8');
    if ($t === '' || $t === '-' || $t === 'EMPTY') return null;
    return preg_match('/^PTB-[0-9A-F]{10}\z/', $t) ? OSHER_BOT_COUPON_GROUP : $t;
}

/** כמו phoneKey: ספרות בלבד, בלי 972 ואפסים בהתחלה, 9 הספרות האחרונות. פחות מ-7 ספרות = null */
function osher_phone_key(string $v): ?string {
    $d = preg_replace('/\D/', '', $v);
    if (strncmp($d, '972', 3) === 0) $d = substr($d, 3);
    $d = ltrim($d, '0');
    return strlen($d) >= 7 ? substr($d, -9) : null;
}

/** כמו Groups.find, עם קיצור דרך */
function osher_find(array &$parent, string $x): string {
    $r = $x;
    while (isset($parent[$r]) && $parent[$r] !== $r) $r = $parent[$r];
    $c = $x;
    while ($c !== $r) {
        $n = $parent[$c];
        $parent[$c] = $r;
        $c = $n;
    }
    return $r;
}

function osher_union(array &$parent, string $a, string $b): void {
    $ra = osher_find($parent, $a);
    $rb = osher_find($parent, $b);
    if ($ra !== $rb) $parent[$rb] = $ra;
}

/** כמו sourceGroupOf */
function osher_source_group(?string $source, array $productNames): ?string {
    if ($source === null) return null;
    if (preg_match("/^(אורגני|צאטבוט|צ'אטבוט)/u", $source)) return OSHER_BOT_SOURCE;
    if (isset($productNames[$source])) return OSHER_SITE_SOURCE;
    return $source;
}

/** כמו indexer: אינדקס עמודות לפי שם, ושורות עם נתונים. זורק RuntimeException כשחסרה עמודה. */
function osher_indexer(array $rows, array $required, string $tabName): array {
    if (!$rows) throw new RuntimeException("לשונית $tabName ריקה");
    $header = array_shift($rows);
    $idx = [];
    // כמו Map של JS: כשיש שתי עמודות באותו שם, האחרונה קובעת
    foreach ($header as $i => $h) $idx[osher_trim($h)] = $i;
    $missing = array_values(array_filter($required, fn ($c) => !array_key_exists($c, $idx)));
    if ($missing) throw new RuntimeException("חסרות עמודות בלשונית $tabName: " . implode(', ', $missing));
    $col = fn (array $r, string $name) => array_key_exists($name, $idx) ? osher_trim($r[$idx[$name]] ?? '') : '';
    $data = array_values(array_filter($rows, function ($r) {
        foreach ($r as $c) if (osher_trim($c) !== '') return true;
        return false;
    }));
    return [$col, $data];
}

/** כמו leadsFromRows. $purchaseRows = null כשאין לשונית רכישות. */
function osher_leads_from_rows(array $leadRows, ?array $purchaseRows, DateTimeImmutable $generatedAt, ?array $mailingRows = null, ?array $waveRows = null, array $extra = []): array {
    return osher_build($leadRows, $purchaseRows, $generatedAt, $mailingRows, $waveRows, $extra)['file'];
}

/** כמו buildData: הקובץ הציבורי, והקודים המזהים שנשמרים בנפרד מחוץ לאתר (#6) */
function osher_build(array $leadRows, ?array $purchaseRows, DateTimeImmutable $generatedAt, ?array $mailingRows = null, ?array $waveRows = null, array $extra = []): array {
    [$lcol, $ldata] = osher_indexer($leadRows, OSHER_REQUIRED, 'הלידים');
    $start = osher_day_start(OSHER_START_DAY);

    $raws = [];
    foreach ($ldata as $index => $cells) {
        $at = osher_parse_date($lcol($cells, 'תאריך כניסה'));
        if (!$at || $at->getTimestamp() < $start) continue;
        $filled = count(array_filter($cells, fn ($c) => osher_trim($c) !== ''));
        $raws[] = ['index' => $index, 'at' => $at, 'ts' => $at->getTimestamp(), 'ns' => $lcol($cells, 'קוד מזהה'), 'filled' => $filled, 'cells' => $cells];
    }

    $kept = osher_dedupe_by_ns($raws);
    usort($kept, fn ($a, $b) => $a['ts'] <=> $b['ts'] ?: $a['index'] <=> $b['index']);
    $firstOfNs = [];
    foreach ($raws as $r) {
        if ($r['ns'] === '') continue;
        if (!isset($firstOfNs[$r['ns']]) || $r['ts'] < $firstOfNs[$r['ns']]['ts']) $firstOfNs[$r['ns']] = $r;
    }

    $productNames = [];
    foreach ($kept as $r) {
        $p = osher_clean($lcol($r['cells'], 'מוצר שנקנה'));
        $t = osher_clean($lcol($r['cells'], 'מבחן'));
        if ($p !== null) $productNames[$p] = true;
        if ($t !== null) $productNames[$t] = true;
    }
    $pcol = null; $pdata = [];
    if ($purchaseRows !== null) {
        [$pcol, $pdata] = osher_indexer($purchaseRows, OSHER_PURCHASE_REQUIRED, 'הרכישות');
        foreach ($pdata as $r) {
            $p = osher_clean($pcol($r, 'מוצר שנקנה'));
            if ($p !== null) $productNames[$p] = true;
        }
    }

    $leads = [];
    $leadOfNs = [];
    foreach ($kept as $i => $r) {
        $leads[] = osher_to_lead($r, $lcol, $productNames, $r['ns'] !== '' ? $firstOfNs[$r['ns']]['at'] : null);
        if ($r['ns'] !== '' && !array_key_exists($r['ns'], $leadOfNs)) $leadOfNs[$r['ns']] = $i;
    }

    $buyerOfNs = [];
    $nextBuyer = 0;
    $buyerId = function (string $ns) use (&$buyerOfNs, &$nextBuyer): int {
        if ($ns === '') return $nextBuyer++;
        if (!array_key_exists($ns, $buyerOfNs)) $buyerOfNs[$ns] = $nextBuyer++;
        return $buyerOfNs[$ns];
    };
    // אדם = קוד מזהה, וקודים מזהים עם אותו טלפון הם אותו אדם
    $parent = [];
    foreach ($ldata as $r) {
        $ns = $lcol($r, 'קוד מזהה');
        $ph = osher_phone_key($lcol($r, 'טלפון'));
        if ($ns !== '' && $ph !== null) osher_union($parent, "n:$ns", "p:$ph");
    }
    if ($pcol !== null) foreach ($pdata as $r) {
        $ns = $pcol($r, 'קוד מזהה');
        $ph = osher_phone_key($pcol($r, 'טלפון'));
        if ($ns !== '' && $ph !== null) osher_union($parent, "n:$ns", "p:$ph");
    }
    $personOfRoot = [];
    $nextPerson = 0;
    $personId = function (string $ns, ?string $phone) use (&$parent, &$personOfRoot, &$nextPerson): int {
        $node = $ns !== '' ? "n:$ns" : ($phone !== null ? "p:$phone" : null);
        if ($node === null) return $nextPerson++;
        $root = osher_find($parent, $node);
        if (!array_key_exists($root, $personOfRoot)) $personOfRoot[$root] = $nextPerson++;
        return $personOfRoot[$root];
    };
    foreach ($kept as $i => $r) $leads[$i]['person'] = $personId($r['ns'], osher_phone_key($lcol($r['cells'], 'טלפון')));

    [$rows, $dupes] = $pcol !== null ? osher_purchases_from_rows($pdata, $pcol, $leads, $leadOfNs, $productNames, $start, $buyerId) : [[], []];
    $withRows = [];
    foreach ($rows as $r) if ($r['p']['lead'] !== null) $withRows[$r['p']['lead']] = true;
    foreach ($leads as $i => $l) {
        if (($l['qStatus'] === 'converted' || $l['qStatus'] === 'payment') && !isset($withRows[$i]) && !(($l['product'] ?? null) !== null && preg_match(OSHER_TEST_PRODUCT, $l['product']))) {
            $rows[] = ['ns' => $kept[$i]['ns'], 'phone' => null, 'p' => ['at' => $l['at'], 'lead' => $i, 'product' => $l['product'] ?? $l['test'], 'amount' => $l['amount'],
                'source' => null, 'sourceGroup' => null, 'campaign' => null, 'fromLead' => true, 'bot' => null,
                'reason' => null, 'coupon' => null, 'buyer' => $buyerId($kept[$i]['ns']), 'person' => 0]];
        }
    }
    usort($rows, fn ($a, $b) => strcmp($a['p']['at'], $b['p']['at']) ?: ($a['p']['lead'] ?? -1) <=> ($b['p']['lead'] ?? -1));
    foreach ($rows as $k => $r) $rows[$k]['p']['person'] = $personId($r['ns'], $r['phone']);
    $mailings = $mailingRows !== null ? osher_mailings_with_ids($mailingRows) : null;
    $at = osher_iso($generatedAt);

    // שם לכל קוד מזהה מלשונית הלידים, לרשימות של תובנות השיחה (רק בקובץ הפרטי)
    $nameOfNs = [];
    foreach ($ldata as $r) {
        $ns = $lcol($r, 'קוד מזהה');
        $name = osher_clean($lcol($r, 'שם לקוח'));
        if ($ns !== '' && $name !== null && !array_key_exists($ns, $nameOfNs)) $nameOfNs[$ns] = $name;
    }
    $insights = osher_insights_from_rows($extra, $at, $leadOfNs, $nameOfNs);

    return [
        'file' => [
            'version' => 2,
            'origin' => 'sheet',
            'generatedAt' => $at,
            'sheetRows' => count($ldata),
            'purchaseRows' => count($pdata),
            'leads' => $leads,
            'purchases' => array_map(fn ($r) => $r['p'], $rows),
            'mailings' => $mailings !== null ? array_map(fn ($m) => $m['m'], $mailings) : null,
            'mailingWaves' => $waveRows !== null ? osher_waves_from_rows($waveRows) : null,
            'dupes' => $dupes,
            'insights' => $insights['file'],
        ],
        // לשימוש בשרת בלבד (לא בקובץ ולא בקובץ הפרטי): הליד של כל קוד מזהה, כדי לחבר מחדש חלק שנשאר מרענון קודם
        'leadOfNs' => $leadOfNs,
        'ids' => array_merge([
            'generatedAt' => $at,
            'leads' => array_map(fn ($r) => $r['ns'], $kept),
            'purchases' => array_map(fn ($r) => $r['ns'], $rows),
            'mailings' => $mailings !== null ? array_map(fn ($m) => $m['ns'], $mailings) : [],
        ], $insights['ids']),
    ];
}

/** כמו insightsFromRows: חמש הלשוניות של תובנות השיחה, כל אחת לחוד */
function osher_insights_from_rows(array $extra, string $readAt, array $leadOfNs, array $nameOfNs): array {
    $start = osher_day_start(OSHER_INSIGHTS_START_DAY);
    $iso = function (string $v): ?string { $d = osher_parse_date($v); return $d ? osher_iso($d) : null; };
    $lead = fn (string $ns) => $ns !== '' && array_key_exists($ns, $leadOfNs) ? $leadOfNs[$ns] : null;
    $name = function (string $own, string $ns) use ($nameOfNs): string {
        $c = osher_clean($own);
        if ($c !== null) return $c;
        return array_key_exists($ns, $nameOfNs) ? $nameOfNs[$ns] : '';
    };
    $counter = function () {
        $ids = [];
        $next = 0;
        return function (string $ns) use (&$ids, &$next): int {
            if ($ns === '') return $next++;
            if (!array_key_exists($ns, $ids)) $ids[$ns] = $next++;
            return $ids[$ns];
        };
    };
    $dated = function (array $data, callable $c, string $dateCol) use ($start): array {
        return array_values(array_filter($data, function ($r) use ($c, $dateCol, $start) {
            $d = osher_parse_date($c($r, $dateCol));
            return !$d || $d->getTimestamp() >= $start;
        }));
    };

    $analysis = null; $analysisIds = null;
    $a = isset($extra['analysis']) && $extra['analysis'] !== null ? osher_optional_indexer($extra['analysis'], OSHER_ANALYSIS) : null;
    if ($a !== null) {
        [$c, $data] = $a;
        $rows = [];
        $priv = ['ns' => [], 'names' => [], 'texts' => []];
        foreach ($data as $r) {
            $ns = $c($r, 'קוד מזהה');
            $rows[] = [
                'at' => $iso($c($r, 'תאריך כניסה')), 'lead' => $lead($ns), 'path' => osher_clean($c($r, 'מסלול')), 'bought' => osher_yes_no_exact($c($r, 'קנה')),
                'step' => osher_clean($c($r, 'שלב אחרון')), 'reason' => osher_clean($c($r, 'סיבת נטישה')), 'agent' => osher_yes_no_exact($c($r, 'פנה לנציג')) === 'yes',
                'inquiry' => osher_clean($c($r, 'קטגוריית פנייה')), 'unanswered' => osher_number($c($r, 'שאלות ללא מענה')), 'feedback' => osher_clean($c($r, 'קטגוריית משוב')),
                'messages' => osher_number($c($r, 'הודעות לקוח')), 'scannedAt' => $iso($c($r, 'נסרק ב:')), 'removal' => osher_clean($c($r, 'סיבת הסרה')),
                'basis' => osher_clean($c($r, 'מקור הסיבה')),
            ];
            $priv['ns'][] = $ns;
            $priv['names'][] = $name('', $ns);
            $priv['texts'][] = osher_clip($c($r, 'פירוט קצר'));
        }
        $analysis = ['readAt' => $readAt, 'rows' => $rows];
        $analysisIds = $priv;
    }

    $questions = null; $examples = null;
    $q = isset($extra['questions']) && $extra['questions'] !== null ? osher_optional_indexer($extra['questions'], OSHER_QUESTIONS) : null;
    if ($q !== null) {
        [$c, $data] = $q;
        $rows = [];
        $examples = [];
        foreach ($data as $r) {
            $text = osher_clean($c($r, 'שאלה'));
            if ($text === null) continue;
            $rows[] = [
                'text' => $text, 'category' => osher_clean($c($r, 'קטגוריה')), 'count' => osher_number($c($r, 'מופעים')) ?? 0, 'lastAt' => $iso($c($r, 'נשאל לאחרונה')),
                'status' => osher_clean($c($r, 'סטטוס')), 'answer' => osher_clean($c($r, 'תשובת יקיר')),
            ];
            $ex = preg_split('/(*UCP)[,\s]+/u', $c($r, 'דוגמאות (קוד מזהה)'));
            $examples[] = array_values(array_filter($ex === false ? [] : $ex, fn ($x) => $x !== ''));
        }
        $questions = ['readAt' => $readAt, 'rows' => $rows];
    }

    $inquiries = null; $inquiryIds = null;
    $i = isset($extra['inquiries']) && $extra['inquiries'] !== null ? osher_optional_indexer($extra['inquiries'], OSHER_INQUIRIES) : null;
    if ($i !== null) {
        [$c, $data] = $i;
        $who = $counter();
        $rows = [];
        $priv = ['ns' => [], 'names' => [], 'texts' => []];
        foreach ($dated($data, $c, 'תאריך פניה') as $r) {
            $ns = $c($r, 'מזהה לקוח');
            $rows[] = ['at' => $iso($c($r, 'תאריך פניה')), 'lead' => $lead($ns), 'who' => $who($ns), 'category' => osher_clean($c($r, 'קטגוריה'))];
            $priv['ns'][] = $ns;
            $priv['names'][] = $name($c($r, 'שם לקוח'), $ns);
            $priv['texts'][] = osher_clip($c($r, 'תוכן הפניה'));
        }
        $inquiries = ['readAt' => $readAt, 'rows' => $rows];
        $inquiryIds = $priv;
    }

    $feedback = null; $feedbackIds = null;
    $f = isset($extra['feedback']) && $extra['feedback'] !== null ? osher_optional_indexer($extra['feedback'], OSHER_FEEDBACK) : null;
    if ($f !== null) {
        [$c, $data] = $f;
        $who = $counter();
        $rows = [];
        $priv = ['ns' => [], 'names' => [], 'texts' => []];
        foreach ($dated($data, $c, 'תאריך') as $r) {
            $ns = $c($r, 'קוד מזהה');
            $exam = $c($r, 'מבחן');
            $rows[] = [
                'at' => $iso($c($r, 'תאריך')), 'lead' => $lead($ns), 'who' => $who($ns), 'category' => osher_clean($c($r, 'קטגוריה')),
                'exam' => $exam === 'עבר' ? 'passed' : ($exam === 'לא עבר' ? 'failed' : null),
            ];
            $priv['ns'][] = $ns;
            $priv['names'][] = $name($c($r, 'שם לקוח'), $ns);
            $priv['texts'][] = osher_clip($c($r, 'הערות'));
        }
        $feedback = ['readAt' => $readAt, 'rows' => $rows];
        $feedbackIds = $priv;
    }

    // נקודות עצירה: כל השורות, בלי סינון תאריך
    $stalls = null; $stallIds = null;
    $s = isset($extra['stalls']) && $extra['stalls'] !== null ? osher_optional_indexer($extra['stalls'], OSHER_STALLS) : null;
    if ($s !== null) {
        [$c, $data] = $s;
        $rows = [];
        $priv = ['ns' => [], 'names' => [], 'texts' => []];
        foreach ($data as $r) {
            $ns = $c($r, 'קוד מזהה');
            $rows[] = [
                'at' => $iso($c($r, 'תאריך כניסה')), 'lead' => $lead($ns), 'process' => osher_clean($c($r, 'שם תהליך')), 'stop' => osher_clean($c($r, 'נקודת עצירה')),
                'detail' => osher_clean($c($r, 'פירוט')), 'messages' => osher_number($c($r, 'הודעות לקוח')), 'lastAt' => $iso($c($r, 'פעילות אחרונה')),
                'scannedAt' => $iso($c($r, 'נסרק ב:')),
            ];
            $priv['ns'][] = $ns;
            $priv['names'][] = $name('', $ns);
            $priv['texts'][] = '';
        }
        $stalls = ['readAt' => $readAt, 'rows' => $rows];
        $stallIds = $priv;
    }

    return [
        'file' => ['analysis' => $analysis, 'questions' => $questions, 'inquiries' => $inquiries, 'feedback' => $feedback, 'stalls' => $stalls],
        'ids' => ['analysis' => $analysisIds, 'inquiries' => $inquiryIds, 'feedback' => $feedbackIds, 'stalls' => $stallIds, 'questions' => $examples],
    ];
}

/** כמו optionalIndexer: לשונית שחסרה בה עמודה = null */
function osher_optional_indexer(array $rows, array $required): ?array {
    try {
        return osher_indexer($rows, $required, '');
    } catch (RuntimeException $e) {
        return null;
    }
}

/** כמו mailingsFromRows */
function osher_mailings_from_rows(array $rows): ?array {
    $x = osher_mailings_with_ids($rows);
    return $x === null ? null : array_map(fn ($m) => $m['m'], $x);
}

function osher_mailings_with_ids(array $rows): ?array {
    $m = osher_optional_indexer($rows, OSHER_MAILING);
    if ($m === null) return null;
    [$c, $data] = $m;
    $ids = [];
    $next = 0;
    $out = [];
    foreach ($data as $r) {
        $at = osher_parse_date($c($r, 'תאריך רכישה'));
        if (!$at) continue;
        $ns = $c($r, 'קוד מזהה');
        if ($ns === '') $buyer = $next++;
        else {
            if (!array_key_exists($ns, $ids)) $ids[$ns] = $next++;
            $buyer = $ids[$ns];
        }
        $sent = osher_parse_date($c($r, 'תאריך שליחה'));
        $out[] = ['ns' => $ns, 'm' => [
            'campaign' => $c($r, 'קמפיין'), 'wave' => $c($r, 'גל'), 'sentAt' => $sent ? osher_iso($sent) : null, 'at' => osher_iso($at), 'buyer' => $buyer,
            'product' => osher_clean($c($r, 'מוצר')), 'amount' => osher_amount($c($r, 'סכום')), 'viaLink' => $c($r, 'דרך קישור הקמפיין') === OSHER_BOT_YES,
            'coupon' => osher_coupon_code($c($r, 'קופון')), 'bot' => osher_bot_flag($c($r, 'של הבוט')), 'reason' => osher_clean($c($r, 'סיבה')),
        ]];
    }
    return $out;
}

/** כמו wavesFromRows */
function osher_waves_from_rows(array $rows): ?array {
    $w = osher_optional_indexer($rows, OSHER_MAILING_WAVE);
    if ($w === null) return null;
    [$c, $data] = $w;
    $n = fn (array $r, string $name) => osher_amount($c($r, $name));
    $out = [];
    foreach ($data as $r) {
        $wave = $c($r, 'גל');
        $sent = $n($r, 'נשלחו');
        $out[] = [
            'campaign' => $c($r, 'קמפיין'), 'wave' => $wave, 'kind' => strpos($wave, 'סה"כ') !== false ? 'total' : ($sent !== null ? 'wave' : 'others'),
            'sentDay' => osher_clean($c($r, 'תאריך שליחה')), 'sent' => $sent, 'undelivered' => $n($r, 'לא נמסרו (WhatsApp)'), 'delivered' => $n($r, 'נמסרו'),
            'buyers' => $n($r, 'קונים'), 'purchases' => $n($r, 'רכישות'), 'amount' => $n($r, 'סכום'), 'viaLinkPurchases' => $n($r, 'רכישות דרך הקישור'),
            'viaLinkAmount' => $n($r, 'סכום דרך הקישור'), 'spooky' => $n($r, 'רכישות עם SPOOKY'), 'bot' => $n($r, 'של הבוט = כן'), 'note' => osher_clean($c($r, 'הערה')),
        ];
    }
    return $out;
}

/** כמו dedupeByNs: לכל קוד מזהה השורה עם יותר תאים מלאים, ובשוויון הראשונה */
function osher_dedupe_by_ns(array $raws): array {
    $best = [];
    $out = [];
    foreach ($raws as $r) {
        if ($r['ns'] === '') { $out[] = $r; continue; }
        if (!isset($best[$r['ns']]) || $r['filled'] > $best[$r['ns']]['filled']) $best[$r['ns']] = $r;
    }
    return array_merge($out, array_values($best));
}

function osher_purchases_from_rows(array $data, callable $col, array $leads, array $leadOfNs, array $productNames, int $start, callable $buyerId): array {
    $rows = [];
    foreach ($data as $cells) {
        $at = osher_parse_date($col($cells, 'תאריך'));
        if (!$at || $at->getTimestamp() < $start) continue;
        $amount = osher_amount($col($cells, 'סכום ששולם'));
        $ns = $col($cells, 'קוד מזהה');
        $lead = $ns !== '' && array_key_exists($ns, $leadOfNs) ? $leadOfNs[$ns] : null;
        $product = osher_clean($col($cells, 'מוצר שנקנה'));
        if ($product !== null && preg_match(OSHER_TEST_PRODUCT, $product)) continue;
        if ($product === null && $lead !== null) {
            $l = $leads[$lead];
            if ($l['amount'] !== null && $amount !== null && $l['amount'] == $amount) $product = $l['product'] ?? $l['test'];
        }
        $source = osher_clean($col($cells, 'מקור הגעה'));
        $rows[] = ['ts' => $at->getTimestamp(), 'ns' => $ns, 'phone' => osher_phone_key($col($cells, 'טלפון')), 'p' => [
            'at' => osher_iso($at), 'lead' => $lead, 'product' => $product, 'amount' => $amount, 'source' => $source,
            'sourceGroup' => osher_source_group($source, $productNames), 'campaign' => osher_clean($col($cells, 'utm_campaign')), 'fromLead' => false,
            'bot' => osher_bot_flag($col($cells, 'של הבוט')),
            'reason' => osher_clean($col($cells, 'סיבה')), 'coupon' => osher_coupon_code($col($cells, 'קופון מהרכישה')), 'buyer' => $buyerId($ns),
            'person' => 0,
        ]];
    }
    $byNs = [];
    foreach ($rows as $i => $r) if ($r['ns'] !== '') $byNs[$r['ns']][] = $i;
    $dropped = [];
    foreach ($byNs as $idxs) {
        usort($idxs, fn ($a, $b) => $rows[$a]['ts'] <=> $rows[$b]['ts']);
        for ($k = 1; $k < count($idxs); $k++) {
            $prev = $rows[$idxs[$k - 1]]; $cur = $rows[$idxs[$k]];
            if ($cur['p']['amount'] === $prev['p']['amount'] && $cur['ts'] - $prev['ts'] <= OSHER_PURCHASE_DUP_SECONDS) $dropped[$idxs[$k]] = true;
        }
    }
    $out = [];
    $dupes = [];
    foreach ($rows as $i => $r) {
        if (isset($dropped[$i])) $dupes[] = $r['p']['at'];
        else $out[] = ['ns' => $r['ns'], 'phone' => $r['phone'], 'p' => $r['p']];
    }
    sort($dupes, SORT_STRING);
    return [$out, $dupes];
}

function osher_to_lead(array $r, callable $col, array $productNames, ?DateTimeImmutable $first): array {
    $c = fn (string $name) => $col($r['cells'], $name);
    $removedRaw = $c('הסיר את עצמו?');
    $removedAt = null;
    if ($removedRaw !== '') {
        $d = osher_parse_date($removedRaw);
        $removedAt = osher_iso($d ?? $r['at']);
    }
    $q = osher_clean($c('סטטוס שאלון'));
    $source = osher_clean($c('מקור הגעה'));
    return [
        'at' => osher_iso($r['at']),
        'source' => $source,
        'sourceGroup' => osher_source_group($source, $productNames),
        'process' => osher_clean($c('שם תהליך')),
        'status' => osher_clean($c('סטטוס')),
        'qStatus' => $q === null ? null : mb_strtolower($q),
        'answered' => $c("ענה לצ'אטבוט?") === 'כן',
        'aiConversation' => osher_yes_no($c('התחיל שיחה')),
        'step' => osher_number($c('שלב בשאלון')),
        'score' => osher_number($c('ניקוד לקוח')),
        'test' => osher_clean($c('מבחן')),
        'product' => osher_clean($c('מוצר שנקנה')),
        'amount' => osher_amount($c('סכום ששולם')),
        'removedAt' => $removedAt,
        'mode' => osher_clean($c('אופן שיחה')),
        'campaign' => osher_clean($c('utm_campaign')),
        'messages' => osher_number($c('הודעות לקוח')),
        'botCoupon' => $c('קופון הבוט') !== '',
        'couponAt' => ($cd = osher_parse_date($c('תאריך קופון'))) ? osher_iso($cd) : null,
        'firstAt' => $first !== null && $first->getTimestamp() < $r['ts'] ? osher_iso($first) : null,
        'person' => 0,
    ];
}

/** כמו pack: בלי שדות ריקים (null או false) */
function osher_pack(array $file): string {
    $strip = function ($v) use (&$strip) {
        if (!is_array($v)) return $v;
        $out = [];
        foreach ($v as $k => $x) {
            if ($x === null || $x === false) continue;
            $out[$k] = $strip($x);
        }
        return $out;
    };
    $f = $file;
    $f['leads'] = array_map($strip, $file['leads']);
    $f['purchases'] = array_map($strip, $file['purchases']);
    foreach (['mailings', 'mailingWaves'] as $k) {
        if ($file[$k] === null) unset($f[$k]);
        else $f[$k] = array_map($strip, $file[$k]);
    }
    // תובנות שיחה: חלק חסר לא נכתב, וכשכולם חסרים נשאר אובייקט ריק (כמו ב-JSON.stringify)
    $ins = [];
    foreach (['analysis', 'questions', 'inquiries', 'feedback', 'stalls'] as $k) {
        $part = $file['insights'][$k] ?? null;
        if ($part === null) continue;
        $ins[$k] = ['readAt' => $part['readAt'], 'rows' => array_map($strip, $part['rows'])];
    }
    $f['insights'] = $ins ? $ins : new stdClass();
    return json_encode($f, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
