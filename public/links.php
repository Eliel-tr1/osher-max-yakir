<?php
/**
 * הקודים המזהים לקישורים לשיחות ב-CloudChat, רק למי שנכנס (#6). הקובץ נכתב בכל רענון, מחוץ לתיקיית האתר.
 * GET -> {generatedAt, leads[], purchases[], mailings[]}, באותו סדר כמו data/leads.json
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex');

require __DIR__ . '/_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit;
}
if (!osher_auth_in()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'צריך להתחבר'], JSON_UNESCAPED_UNICODE);
    exit;
}
$ids = osher_read_private('ids.json');
if ($ids === null) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'הקישורים יופיעו אחרי רענון'], JSON_UNESCAPED_UNICODE);
    exit;
}
echo $ids;
