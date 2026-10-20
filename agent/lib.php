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

// ---------- שיחה ----------

/** ההודעות של מזהה אחד, מהישנה לחדשה. null אם המזהה לא קיים בבוט. */
function conversation(string $ns): ?array {
    $res = cc_get('/subscriber/chat-messages', ['user_ns' => $ns, 'include_bot' => 1, 'limit' => 100]);
    if ($res['code'] === 404) return null;
    if ($res['code'] !== 200 || !is_array($res['json']['data'] ?? null)) throw new RuntimeException("CloudChat החזיר {$res['code']}");
    $msgs = $res['json']['data'];
    usort($msgs, fn($a, $b) => ($a['ts'] ?? 0) <=> ($b['ts'] ?? 0));
    return $msgs;
}

function msg_text(array $m): string {
    $t = trim((string) ($m['content'] ?? ''));
    if ($t === '') $t = trim((string) ($m['payload']['text'] ?? ''));
    return $t;
}

/** כמה הודעות כתב כל צד. "in" = הלקוח (כולל לחיצה על כפתור), "out" ו-"agent" = הבוט או נציג. */
function sides(array $msgs): array {
    $c = ['customer' => 0, 'bot' => 0];
    foreach ($msgs as $m) {
        $t = $m['type'] ?? '';
        if ($t === 'in') $c['customer']++;
        elseif ($t === 'out' || $t === 'agent') $c['bot']++;
    }
    return $c;
}

const MIN_EACH_SIDE = 2;   // שיחה עם תוכן: לפחות 2 הודעות מכל צד (החלטת המנהל, 2026-10-20)

function has_content(array $msgs): bool {
    $s = sides($msgs);
    return $s['customer'] >= MIN_EACH_SIDE && $s['bot'] >= MIN_EACH_SIDE;
}

/** תמליל ל-AI: בלי טלפונים, מיילים וקישורים, עד 12,000 תווים (הסוף נשמר). */
function transcript(array $msgs): string {
    $lines = [];
    foreach ($msgs as $m) {
        $who = match ($m['type'] ?? '') { 'in' => 'Customer', 'agent' => 'Human agent', 'out' => 'Bot', default => null };
        $t = msg_text($m);
        if ($who === null || $t === '') continue;
        $t = preg_replace('/[\w.+-]+@[\w-]+\.[\w.]+/u', '[email]', $t);
        $t = preg_replace('/https?:\/\/\S+/u', '[link]', $t);
        $t = preg_replace('/\+?\d[\d\s-]{7,}\d/u', '[number]', $t);
        $lines[] = "$who: " . preg_replace('/\s+/u', ' ', $t);
    }
    $s = implode("\n", $lines);
    return mb_strlen($s) > 12000 ? '...' . mb_substr($s, -12000) : $s;
}

// ---------- OpenAI ----------

const AI_MODELS = ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];   // הראשון שזמין בחשבון

function openai(string $method, string $path, ?array $body = null): array {
    $ch = curl_init('https://api.openai.com/v1' . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120, CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . env_value('OPENAI_API_KEY'), 'Content-Type: application/json'],
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    $raw = curl_exec($ch);
    return ['code' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'json' => is_string($raw) ? json_decode($raw, true) : null];
}

function ai_model(): string {
    static $model = null;
    if ($model) return $model;
    $ids = array_column(openai('GET', '/models')['json']['data'] ?? [], 'id');
    foreach (AI_MODELS as $m) if (in_array($m, $ids, true)) return $model = $m;
    throw new RuntimeException('אף אחד מהמודלים ' . implode(', ', AI_MODELS) . ' לא זמין בחשבון OpenAI');
}

const AI_PROMPT = <<<'TXT'
You classify WhatsApp conversations between the sales and support bot of a prop trading firm (PTB, operated by Osher Max) and one lead. The bot runs a short plan-matching questionnaire, answers questions and sends payment links.

Return exactly one type:
- "מכירתי" (sales): the customer shows interest in buying. Examples: asks about prices, plans, challenges or tests, account sizes, platforms before buying, answers the plan-matching questionnaire, asks about a coupon or discount, asks for or receives a payment link, discusses which plan to choose.
- "שירותי" (service): anything else. Examples: help with something that already exists (an account, login, platform access, payouts, rules after purchase), a technical problem, a complaint, a refund request, a general question that is not about buying.

If both appear, choose the type that dominates what the customer actually wanted. Judge mainly by the customer's messages; bot templates alone do not decide the type.

"reason": one short sentence in Hebrew, at most 20 words, describing what the customer wanted. Never include names, phone numbers, emails, amounts of personal funds or any other personal detail.
TXT;

/** סיווג שיחה: ['type' => 'מכירתי'|'שירותי', 'reason' => '...', 'tokens' => n]. */
function classify(string $transcript): array {
    $model = ai_model();
    $body = [
        'model' => $model,
        'messages' => [['role' => 'system', 'content' => AI_PROMPT], ['role' => 'user', 'content' => "Conversation:\n" . $transcript]],
        'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => 'conversation_type', 'strict' => true, 'schema' => [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['type', 'reason'],
            'properties' => ['type' => ['type' => 'string', 'enum' => ['מכירתי', 'שירותי']], 'reason' => ['type' => 'string']],
        ]]],
    ];
    if (str_starts_with($model, 'gpt-5')) $body['reasoning_effort'] = 'minimal';
    for ($attempt = 1; $attempt <= 2; $attempt++) {
        $res = openai('POST', '/chat/completions', $body);
        if ($res['code'] === 200) break;
        if ($attempt === 1 && in_array($res['code'], [429, 500, 502, 503], true)) { sleep(20); continue; }
        throw new RuntimeException("OpenAI החזיר {$res['code']}: " . mb_substr((string) ($res['json']['error']['message'] ?? ''), 0, 200));
    }
    $out = json_decode((string) ($res['json']['choices'][0]['message']['content'] ?? ''), true);
    if (!in_array($out['type'] ?? '', ['מכירתי', 'שירותי'], true)) throw new RuntimeException('תשובה לא תקינה מ-OpenAI');
    return ['type' => $out['type'], 'reason' => trim((string) $out['reason']), 'tokens' => (int) ($res['json']['usage']['total_tokens'] ?? 0)];
}

/** הצפנה לסוכן הפיתוח: רק מי שמחזיק במפתח הפרטי (לא בשרת ולא בריפו) יכול לקרוא. */
function seal_for_review(string $text): string {
    $pub = file_get_contents(__DIR__ . '/review-key.pub.pem');
    $iv = random_bytes(16);
    if (!openssl_seal($text, $sealed, $ekeys, [$pub], 'aes-256-cbc', $iv)) throw new RuntimeException('הצפנה נכשלה');
    return chunk_split(base64_encode(json_encode(['k' => base64_encode($ekeys[0]), 'iv' => base64_encode($iv), 'd' => base64_encode($sealed)])), 76, "\n");
}
