<?php
// בדיקת עזר: איך תבנית ההתראה לצוות על פנייה לנציג בונה את הקישור לשיחה. רק שם תבנית וקישורי כפתורים.
require __DIR__ . '/lib.php';
$ch = curl_init(CC_API . '/whatsapp-template/list');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{}', CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . env_value('CLOUDCHAT_API_KEY'), 'Content-Type: application/json', 'Accept: application/json']]);
$j = json_decode((string) curl_exec($ch), true);
echo 'HTTP ' . curl_getinfo($ch, CURLINFO_RESPONSE_CODE) . "\n";
$list = $j['data'] ?? $j ?? [];
foreach ((array) $list as $t) {
    $s = json_encode($t, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!preg_match('/agent|nציג|נציג/u', (string) ($t['name'] ?? ''))) continue;
    preg_match_all('#https?://[^"\s\\\\]+#', $s, $m);
    echo ($t['name'] ?? '?') . ': ' . implode(' | ', array_unique($m[0])) . "\n";
}
