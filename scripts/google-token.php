<?php
// טוקן לקריאה בלבד מחשבון השירות (#29), לבדיקות על הגיליון ב-GitHub. php scripts/google-token.php <key.json>
// מדפיס רק את הטוקן (שעה אחת). המפתח לא מודפס, ושגיאה היא רק הסוג שלה.
require __DIR__ . '/../public/_gsheet.php';
$key = osher_google_key_from(is_file($argv[1] ?? '') ? (string) file_get_contents($argv[1]) : null);
if (!$key) {
    fwrite(STDERR, "אין מפתח תקין\n");
    exit(1);
}
[$token, , $err] = osher_google_request_token($key);
if (!$token) {
    fwrite(STDERR, $err . "\n");
    exit(1);
}
echo $token;
