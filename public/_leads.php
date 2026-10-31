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
function osher_leads_from_rows(array $leadRows, ?array $purchaseRows, DateTimeImmutable $generatedAt, ?array $mailingRows = null, ?array $waveRows = null): array {
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
    $purchases = $pcol !== null ? osher_purchases_from_rows($pdata, $pcol, $leads, $leadOfNs, $productNames, $start, $buyerId) : [];
    $withRows = [];
    foreach ($purchases as $p) if ($p['lead'] !== null) $withRows[$p['lead']] = true;
    foreach ($leads as $i => $l) {
        if (($l['qStatus'] === 'converted' || $l['qStatus'] === 'payment') && !isset($withRows[$i])) {
            $purchases[] = ['at' => $l['at'], 'lead' => $i, 'product' => $l['product'] ?? $l['test'], 'amount' => $l['amount'],
                'source' => null, 'sourceGroup' => null, 'campaign' => null, 'fromLead' => true, 'bot' => null,
                'reason' => null, 'coupon' => null, 'buyer' => $buyerId($kept[$i]['ns'])];
        }
    }
    usort($purchases, fn ($a, $b) => strcmp($a['at'], $b['at']) ?: ($a['lead'] ?? -1) <=> ($b['lead'] ?? -1));

    return [
        'version' => 2,
        'origin' => 'sheet',
        'generatedAt' => osher_iso($generatedAt),
        'sheetRows' => count($ldata),
        'purchaseRows' => count($pdata),
        'leads' => $leads,
        'purchases' => $purchases,
        'mailings' => $mailingRows !== null ? osher_mailings_from_rows($mailingRows) : null,
        'mailingWaves' => $waveRows !== null ? osher_waves_from_rows($waveRows) : null,
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
        $out[] = [
            'campaign' => $c($r, 'קמפיין'), 'wave' => $c($r, 'גל'), 'sentAt' => $sent ? osher_iso($sent) : null, 'at' => osher_iso($at), 'buyer' => $buyer,
            'product' => osher_clean($c($r, 'מוצר')), 'amount' => osher_amount($c($r, 'סכום')), 'viaLink' => $c($r, 'דרך קישור הקמפיין') === OSHER_BOT_YES,
            'coupon' => osher_coupon_code($c($r, 'קופון')), 'bot' => osher_bot_flag($c($r, 'של הבוט')), 'reason' => osher_clean($c($r, 'סיבה')),
        ];
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
        $rows[] = ['ts' => $at->getTimestamp(), 'ns' => $ns, 'p' => [
            'at' => osher_iso($at), 'lead' => $lead, 'product' => $product, 'amount' => $amount, 'source' => $source,
            'sourceGroup' => osher_source_group($source, $productNames), 'campaign' => osher_clean($col($cells, 'utm_campaign')), 'fromLead' => false,
            'bot' => osher_bot_flag($col($cells, 'של הבוט')),
            'reason' => osher_clean($col($cells, 'סיבה')), 'coupon' => osher_coupon_code($col($cells, 'קופון מהרכישה')), 'buyer' => $buyerId($ns),
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
    foreach ($rows as $i => $r) if (!isset($dropped[$i])) $out[] = $r['p'];
    return $out;
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
    return json_encode($f, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
