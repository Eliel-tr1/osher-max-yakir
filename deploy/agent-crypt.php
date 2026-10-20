<?php
// רץ בשרת. העברה מוצפנת של מפתחות לסוכן, בלי סודות בגיטהאב:
//   pub     יוצר (פעם אחת) זוג מפתחות RSA בתיקיית הסוכן, ומדפיס רק את החלק הציבורי
//   dec     מקבל בקלט טקסט מוצפן (base64) ומדפיס את הפענוח, ל-agent-env.sh
//   forget  מוחק את מפתח הפענוח, כך שהטקסט המוצפן בריפו כבר לא שווה כלום
$dir = getenv('HOME') . '/osher-max-agent';
umask(077);
if (!is_dir($dir)) mkdir($dir, 0700, true);
$kf = "$dir/transfer-key.pem";
$mode = $argv[1] ?? '';
if ($mode === 'pub') {
    if (!is_file($kf)) {
        $k = openssl_pkey_new(['private_key_bits' => 4096, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        if (!$k || !openssl_pkey_export($k, $pem)) { fwrite(STDERR, "יצירת מפתח נכשלה\n"); exit(1); }
        file_put_contents($kf, $pem);
        chmod($kf, 0600);
    }
    echo openssl_pkey_get_details(openssl_pkey_get_private(file_get_contents($kf)))['key'];
} elseif ($mode === 'dec') {
    $c = base64_decode(trim(stream_get_contents(STDIN)), true);
    if (!is_file($kf) || $c === false) { fwrite(STDERR, "אין מפתח פענוח או שהקלט לא תקין\n"); exit(1); }
    if (!openssl_private_decrypt($c, $out, file_get_contents($kf), OPENSSL_PKCS1_OAEP_PADDING)) { fwrite(STDERR, "הפענוח נכשל\n"); exit(1); }
    echo rtrim($out, "\n");
} elseif ($mode === 'forget') {
    @unlink($kf);
    echo "מפתח הפענוח נמחק\n";
} else {
    fwrite(STDERR, "pub | dec | forget\n");
    exit(1);
}
