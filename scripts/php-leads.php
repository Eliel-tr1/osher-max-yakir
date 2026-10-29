<?php
// לבדיקת ההתאמה בלבד: php scripts/php-leads.php <leads.csv> <generatedAt ISO> [purchases.csv]
require __DIR__ . '/../public/_leads.php';
$rows = osher_parse_csv(file_get_contents($argv[1]));
$purchases = isset($argv[3]) ? osher_parse_csv(file_get_contents($argv[3])) : null;
try {
    echo osher_pack(osher_leads_from_rows($rows, $purchases, new DateTimeImmutable($argv[2])));
} catch (RuntimeException $e) {
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
