<?php
// לבדיקת ההתאמה בלבד: php scripts/php-leads.php <leads.csv> <generatedAt ISO> [purchases.csv|-] [mailings.csv|-] [waves.csv|-]
//     [analysis.csv|-] [questions.csv|-] [inquiries.csv|-] [feedback.csv|-] [stalls.csv|-]
// עם OSHER_IDS=1 מדפיס את הקודים המזהים (הקובץ הפרטי) במקום הקובץ הציבורי
require __DIR__ . '/../public/_leads.php';
$csv = fn (int $i) => isset($argv[$i]) && $argv[$i] !== '-' ? osher_parse_csv(file_get_contents($argv[$i])) : null;
$rows = osher_parse_csv(file_get_contents($argv[1]));
try {
    $extra = ['analysis' => $csv(6), 'questions' => $csv(7), 'inquiries' => $csv(8), 'feedback' => $csv(9), 'stalls' => $csv(10)];
    $built = osher_build($rows, $csv(3), new DateTimeImmutable($argv[2]), $csv(4), $csv(5), $extra);
    echo getenv('OSHER_IDS') ? json_encode($built['ids'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : osher_pack($built['file']);
} catch (RuntimeException $e) {
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
