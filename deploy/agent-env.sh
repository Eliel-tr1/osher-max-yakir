#!/usr/bin/env bash
# רץ בשרת. מקבל בקלט שורות KEY=VALUE וכותב אותן ל-~/osher-max-agent/.env
# מחוץ לתיקיית האתר, תיקייה 700 וקובץ 600 (רק הבעלים קורא). מפתח קיים שלא נשלח נשאר.
# מדפיס רק שמות של מפתחות והרשאות, אף פעם לא ערכים.
set -euo pipefail
umask 077
D="$HOME/osher-max-agent"
case "$D" in "$HOME/htdocs"*) echo "שגיאה: התיקייה בתוך האתר"; exit 1;; esac
mkdir -p "$D"; chmod 700 "$D"
F="$D/.env"; touch "$F"; chmod 600 "$F"
NEW=$(cat)
if [ -z "$NEW" ]; then echo "לא התקבל אף מפתח"; exit 1; fi
KEYS=$(printf '%s\n' "$NEW" | cut -d= -f1 | paste -sd'|')
TMP=$(mktemp "$D/.env.XXXXXX")
grep -vE "^($KEYS)=" "$F" > "$TMP" || true
printf '%s\n' "$NEW" >> "$TMP"
chmod 600 "$TMP"; mv "$TMP" "$F"
echo "מפתחות בקובץ: $(cut -d= -f1 "$F" | paste -sd' ')"
echo "הרשאות: תיקייה $(stat -c %a "$D"), קובץ $(stat -c %a "$F")"
echo "מיקום: ~/osher-max-agent/.env (מחוץ ל-htdocs)"
