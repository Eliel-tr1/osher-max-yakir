<?php
// בדיקת עזר: המזהה הנוכחי בבוט של טלפון הבדיקה (TEST_PHONE ב-.env). מדפיס רק את המזהה.
require __DIR__ . '/lib.php';
$r = cc_get('/subscriber/get-info-by-user-id', ['user_id' => env_value('TEST_PHONE')]);
$d = $r['json']['data'] ?? $r['json'] ?? [];
echo "HTTP {$r['code']}, user_ns: " . ($d['user_ns'] ?? '?') . ', הודעה אחרונה: ' . ($d['last_message_at'] ?? '?') . "\n";
