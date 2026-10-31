<?php
// לבדיקת ההתאמה בלבד: php scripts/php-leads.php <leads.csv> <generatedAt ISO> [purchases.csv|-] [mailings.csv|-] [waves.csv|-]
require __DIR__ . '/../public/_leads.php';
$csv = fn (int $i) => isset($argv[$i]) && $argv[$i] !== '-' ? osher_parse_csv(file_get_contents($argv[$i])) : null;
$rows = osher_parse_csv(file_get_contents($argv[1]));
try {
    echo osher_pack(osher_leads_from_rows($rows, $csv(3), new DateTimeImmutable($argv[2]), $csv(4), $csv(5)));
} catch (RuntimeException $e) {
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
