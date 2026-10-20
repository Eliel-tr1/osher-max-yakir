<?php
// סוכן ניתוח השיחות (#20): פונקציות משותפות. רץ בשרת, בשורת הפקודה.
// המפתחות נקראים מ-~/osher-max-agent/.env. אף פעם לא מדפיסים מפתח או תוכן של שיחה.
declare(strict_types=1);

const SHEET_ID = '1nTqoRITyNlLJO4Pld0H4SRMIbT21oudBw6mDBoxXaUU';
const SHEET_TAB = 'לידים';
const CC_API = 'https://console.thecloud.chat/api';
const CC_GAP_SECONDS = 3;      // בין קריאה לקריאה לבוט
const CC_429_WAIT = 60;        // אם אין Retry-After

date_default_timezone_set('Asia/Jerusalem');

function agent_home(): string { return (getenv('HOME') ?: '/tmp') . '/osher-max-agent'; }

function env_value(string $key): string {
    static $env = null;
    if ($env === null) {
        $env = [];
        foreach (@file(agent_home() . '/.env', FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $p = strpos($line, '=');
            if ($p !== false) $env[substr($line, 0, $p)] = substr($line, $p + 1);
        }
    }
    if (empty($env[$key])) throw new RuntimeException("חסר $key ב-.env");
    return $env[$key];
}

/** הטבלה כמו בכפתור הרענון: [כותרות, שורות]. שורה ריקה לגמרי מדולגת. */
function sheet_rows(): array {
    $url = 'https://docs.google.com/spreadsheets/d/' . SHEET_ID . '/gviz/tq?tqx=out:csv&sheet=' . rawurlencode(SHEET_TAB);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60]);
    $csv = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($csv === false || $code !== 200 || str_starts_with(ltrim($csv), '<')) throw new RuntimeException("קריאת הטבלה נכשלה ($code)");
    $f = fopen('php://temp', 'r+');
    fwrite($f, preg_replace('/^\xEF\xBB\xBF/', '', $csv));
    rewind($f);
    $head = array_map('trim', fgetcsv($f, null, ',', '"', '') ?: []);
    $rows = [];
    while (($r = fgetcsv($f, null, ',', '"', '')) !== false) {
        if (implode('', array_map('trim', $r)) !== '') $rows[] = $r;
    }
    return [$head, $rows];
}

function col_of(array $head, string $name): int {
    $i = array_search($name, $head, true);
    if ($i === false) throw new RuntimeException("אין עמודה בשם \"$name\"");
    return (int) $i;
}

function cell(array $row, int $i): string { return trim((string) ($row[$i] ?? '')); }

function parse_date(string $s): ?DateTimeImmutable {
    foreach (['d/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y'] as $f) {
        $d = DateTimeImmutable::createFromFormat('!' . $f, $s);
        if ($d) return $d;
    }
    return null;
}

/** GET ל-CloudChat: קריאה אחת בכל פעם, CC_GAP_SECONDS ביניהן. על 429 מחכים וניסיון אחד נוסף. */
function cc_get(string $path, array $query): array {
    static $last = 0.0;
    for ($attempt = 1; ; $attempt++) {
        $wait = $last + CC_GAP_SECONDS - microtime(true);
        if ($wait > 0) usleep((int) ($wait * 1e6));
        $headers = [];
        $ch = curl_init(CC_API . $path . '?' . http_build_query($query));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . env_value('CLOUDCHAT_API_KEY'), 'Accept: application/json'],
            CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$headers) {
                $p = strpos($h, ':');
                if ($p !== false) $headers[strtolower(trim(substr($h, 0, $p)))] = trim(substr($h, $p + 1));
                return strlen($h);
            },
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $last = microtime(true);
        if ($code === 429 && $attempt === 1) {
            sleep(max(1, (int) ($headers['retry-after'] ?? CC_429_WAIT)));
            continue;
        }
        $limits = array_filter($headers, fn($k) => str_contains($k, 'ratelimit') || $k === 'retry-after', ARRAY_FILTER_USE_KEY);
        return ['code' => $code, 'json' => is_string($body) ? json_decode($body, true) : null, 'limits' => $limits];
    }
}
