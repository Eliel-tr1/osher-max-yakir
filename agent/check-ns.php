<?php
// בדיקת עזר: אילו מזהים מוכרים של משתמשי בדיקה עדיין קיימים בבוט. בלי תוכן ובלי טלפון.
require __DIR__ . '/lib.php';
foreach (['f280955u1008808309', 'f280955u1008775515', 'f280955u1005694907', 'f280955u999548487'] as $ns) {
    $r = cc_get('/subscriber/chat-messages', ['user_ns' => $ns, 'include_bot' => 1, 'limit' => 5]);
    $m = $r['json']['data'] ?? null;
    $ts = is_array($m) ? array_filter(array_map(fn($x) => (int) ($x['ts'] ?? 0), $m)) : [];
    echo "$ns: HTTP {$r['code']}" . ($ts ? ', הודעה אחרונה ' . date('d/m/Y H:i', max($ts)) : '') . (is_array($m) ? '' : ', ' . mb_substr((string) ($r['json']['message'] ?? ''), 0, 60)) . "\n";
}
