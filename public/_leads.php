<?php
/**
 * מהטבלה ללידים, בשרת. תרגום של lib/sheet/parse.ts ו-lib/leads/fromSheet.ts ו-lib/leads/file.ts (pack).
 * המקור הוא קוד ה-TypeScript. בדיקה בגיטהאב (tests/parity.test.ts) מריצה את שניהם על אותה טבלה
 * ודורשת תוצאה זהה, כך ששינוי באחד בלי השני נכשל.
 * הקובץ מגדיר פונקציות בלבד. גישה ישירה אליו מהדפדפן לא עושה כלום.
 */

const OSHER_REQUIRED = ['תאריך כניסה', 'טלפון', 'מייל', 'מקור הגעה', 'סטטוס', 'הסיר את עצמו?', "ענה לצ'אטבוט?",
    'שלב בשאלון', 'סטטוס שאלון', 'שם תהליך', 'ניקוד לקוח', 'מבחן', 'מוצר שנקנה', 'סכום ששולם'];
const OSHER_OPTIONAL = ['התחיל שיחה', 'אופן שיחה'];
const OSHER_DUP_SECONDS = 10;

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

function osher_is_yes(string $v): bool {
    $t = osher_trim($v);
    return $t !== '' && !preg_match('/^(לא|no|false|0)$/iu', $t);
}

/** כמו leadsFromRows. זורק RuntimeException כשחסרה עמודה. */
function osher_leads_from_rows(array $rows, DateTimeImmutable $generatedAt): array {
    if (!$rows) throw new RuntimeException('הטבלה ריקה');
    $header = array_shift($rows);
    $idx = [];
    // כמו Map של JS: כשיש שתי עמודות באותו שם, האחרונה קובעת
    foreach ($header as $i => $h) $idx[osher_trim($h)] = $i;
    $missing = array_values(array_filter(OSHER_REQUIRED, fn ($c) => !array_key_exists($c, $idx)));
    if ($missing) throw new RuntimeException('חסרות עמודות בלשונית הלידים: ' . implode(', ', $missing));
    $col = fn (array $r, string $name) => array_key_exists($name, $idx) ? osher_trim($r[$idx[$name]] ?? '') : '';

    $data = array_values(array_filter($rows, function ($r) {
        foreach ($r as $c) if (osher_trim($c) !== '') return true;
        return false;
    }));
    $raws = [];
    $skipped = 0;
    foreach ($data as $index => $cells) {
        $at = osher_parse_date($col($cells, 'תאריך כניסה'));
        if (!$at) { $skipped++; continue; }
        $phone = substr(preg_replace('/\D/', '', $col($cells, 'טלפון')), -9);
        $mail = mb_strtolower($col($cells, 'מייל'));
        $key = $phone !== '' && $phone !== false ? $phone : ($mail !== '' ? $mail : null);
        $filled = count(array_filter($cells, fn ($c) => osher_trim($c) !== ''));
        $raws[] = ['index' => $index, 'at' => $at, 'ts' => $at->getTimestamp(), 'key' => $key, 'filled' => $filled, 'cells' => $cells];
    }

    $dropped = osher_find_duplicates($raws);
    $leads = [];
    foreach ($raws as $r) {
        if (isset($dropped[$r['index']])) continue;
        $leads[] = osher_to_lead($r, $col);
    }
    usort($leads, fn ($a, $b) => strcmp($a['at'], $b['at']));
    return [
        'version' => 1,
        'origin' => 'sheet',
        'generatedAt' => osher_iso($generatedAt),
        'sheetRows' => count($data),
        'duplicatesRemoved' => count($dropped),
        'skippedRows' => $skipped,
        'leads' => $leads,
    ];
}

function osher_find_duplicates(array $raws): array {
    $dropped = [];
    $groups = [];
    foreach ($raws as $r) if ($r['key'] !== null) $groups[$r['key']][] = $r;
    foreach ($groups as $g) {
        if (count($g) < 2) continue;
        usort($g, fn ($a, $b) => $a['ts'] <=> $b['ts'] ?: $a['index'] <=> $b['index']);
        $cluster = [$g[0]];
        $flush = function () use (&$cluster, &$dropped) {
            if (count($cluster) < 2) return;
            $keep = $cluster[0];
            foreach ($cluster as $r) if ($r['filled'] > $keep['filled']) $keep = $r;
            foreach ($cluster as $r) if ($r['index'] !== $keep['index']) $dropped[$r['index']] = true;
        };
        for ($i = 1; $i < count($g); $i++) {
            if ($g[$i]['ts'] - $g[$i - 1]['ts'] <= OSHER_DUP_SECONDS) {
                $cluster[] = $g[$i];
            } else {
                $flush();
                $cluster = [$g[$i]];
            }
        }
        $flush();
    }
    return $dropped;
}

function osher_to_lead(array $r, callable $col): array {
    $c = fn (string $name) => $col($r['cells'], $name);
    $removedRaw = $c('הסיר את עצמו?');
    $removedAt = null;
    if ($removedRaw !== '') {
        $d = osher_parse_date($removedRaw);
        $removedAt = osher_iso($d ?? $r['at']);
    }
    $q = osher_clean($c('סטטוס שאלון'));
    return [
        'at' => osher_iso($r['at']),
        'source' => osher_clean($c('מקור הגעה')),
        'process' => osher_clean($c('שם תהליך')),
        'status' => osher_clean($c('סטטוס')),
        'qStatus' => $q === null ? null : mb_strtolower($q),
        'answered' => $c("ענה לצ'אטבוט?") === 'כן',
        'started' => osher_is_yes($c('התחיל שיחה')),
        'step' => osher_number($c('שלב בשאלון')),
        'score' => osher_number($c('ניקוד לקוח')),
        'test' => osher_clean($c('מבחן')),
        'product' => osher_clean($c('מוצר שנקנה')),
        'amount' => osher_amount($c('סכום ששולם')),
        'removedAt' => $removedAt,
        'mode' => osher_clean($c('אופן שיחה')),
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
    return json_encode($f, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
