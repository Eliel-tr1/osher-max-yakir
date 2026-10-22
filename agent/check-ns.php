<?php
// בדיקת עזר: אילו מזהים מוכרים של משתמשי בדיקה עדיין קיימים בבוט, עם 4 הספרות האחרונות של הטלפון בלבד.
require __DIR__ . '/lib.php';
foreach (['f280955u1008808309', 'f280955u1008775515', 'f280955u1005694907'] as $ns) {
    $r = cc_get('/subscriber/get-info', ['user_ns' => $ns]);
    $j = $r['json'] ?? [];
    $d = $j['data'] ?? $j;
    $ph = preg_replace('/\D/', '', (string) ($d['phone'] ?? $d['user_id'] ?? ''));
    echo "$ns: HTTP {$r['code']}, טלפון מסתיים ב-" . ($ph !== '' ? substr($ph, -4) : '?') . ', הודעה אחרונה ' . ($d['last_message_at'] ?? '?') . ', מייל ' . (str_contains((string) ($d['email'] ?? ''), '@') ? 'יש' : 'אין') . "\n";
}
