<?php
// לבדיקת ההתאמה בלבד: php scripts/php-leads.php <csv> <generatedAt ISO>
require __DIR__ . '/../public/_leads.php';
$rows = osher_parse_csv(file_get_contents($argv[1]));
try {
    echo osher_pack(osher_leads_from_rows($rows, new DateTimeImmutable($argv[2])));
} catch (RuntimeException $e) {
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
