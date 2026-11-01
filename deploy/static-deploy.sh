#!/usr/bin/env bash
# רץ על השרת אחרי כל העלאה.
#   static-deploy.sh <גרסה> <קובץ-ההעלאה>   מחליף את התיקייה oshermax באתר בגרסה חדשה של הדשבורד
#   static-deploy.sh data <leads.json>       מחליף רק את קובץ הנתונים (כל 5 דקות)
#
# באתר יש פרויקטים חיים אחרים. הסקריפט נוגע רק ב:
#   <האתר>/oshermax                      - הדשבורד עצמו
#   ~/.cache/osher-max-dashboard         - העלאות, הגרסה החדשה לפני ההחלפה, והגרסה הקודמת
#   ~/osher-max-private/leads.json       - קובץ הנתונים, מחוץ לאתר. מוגש רק אחרי כניסה בסיסמה (data.php, 1/11/2026)
# ואם בתיקייה oshermax יש משהו שלא אנחנו העלינו, הוא עוצר בלי לגעת בכלום.
set -euo pipefail

SITE="${SITE_DIR:-$HOME/htdocs/ai.vitrue.co.il}"
NAME=oshermax
MARK=.osher-max-dashboard
REL="$1"
ARCHIVE="$2"

STATE="$HOME/.cache/osher-max-dashboard"
TARGET="$SITE/$NAME"
NEW="$STATE/new"
PREV="$STATE/prev"
PRIV="${OSHER_PRIVATE_DIR:-$HOME/osher-max-private}"

# מתקין קובץ נתונים בתיקייה הפרטית, רק אם הוא לא ישן יותר ממה שכבר שם
install_data() {
  local src="$1" new old
  ( umask 077; mkdir -p "$PRIV" )
  new=$(head -c 400 "$src" | grep -o '"generatedAt":"[^"]*"' || true)
  old=$( [ -f "$PRIV/leads.json" ] && head -c 400 "$PRIV/leads.json" | grep -o '"generatedAt":"[^"]*"' || true)
  if [ -n "$old" ] && [[ "$new" < "$old" ]]; then echo "בשרת כבר יש נתונים חדשים יותר"; return 0; fi
  ( umask 077; cp "$src" "$PRIV/.leads.json.tmp" && mv -f "$PRIV/.leads.json.tmp" "$PRIV/leads.json" )
}

fail() { echo "$1" >&2; rm -f "$ARCHIVE"; exit 1; }

[ -d "$SITE" ] || fail "תיקיית האתר לא נמצאה. לא נגעתי בכלום."
[ -w "$SITE" ] || fail "אין הרשאת כתיבה לתיקיית האתר. לא נגעתי בכלום."
if [ -L "$TARGET" ] || { [ -e "$TARGET" ] && [ ! -f "$TARGET/$MARK" ]; }; then
  fail "בתיקייה $NAME באתר יש משהו שלא אנחנו העלינו. לא נגעתי בה."
fi

if [ "$REL" = data ]; then
  # עדכון נתונים בלבד: רק לתוך דשבורד שכבר באוויר, ורק קובץ שנראה תקין
  [ -f "$TARGET/$MARK" ] || fail "הדשבורד עוד לא באוויר. לא נגעתי בכלום."
  [ -s "$ARCHIVE" ] && head -c 200 "$ARCHIVE" | grep -q '"version":[0-9]' && grep -q '"leads":\[' "$ARCHIVE" \
    || fail "קובץ הנתונים שהועלה לא תקין. הנתונים שבאוויר נשארו כמו שהם."
  install_data "$ARCHIVE"
  rm -rf "$TARGET/data"
  rm -f "$ARCHIVE"
  echo "הנתונים עודכנו"
  exit 0
fi

mkdir -p "$STATE"
rm -rf "$NEW"
mkdir -p "$NEW"
tar -xzf "$ARCHIVE" -C "$NEW"
rm -f "$ARCHIVE"

# הגרסה החדשה שלמה? רק אז מחליפים
if [ ! -f "$NEW/index.html" ] || [ ! -f "$NEW/$MARK" ] || ! grep -q "\"sha\":\"$REL\"" "$NEW/version.json" 2>/dev/null; then
  rm -rf "$NEW"
  fail "הגרסה שהועלתה לא שלמה. הגרסה שבאוויר נשארה כמו שהיא."
fi

# הנתונים לא נשארים בתיקיית האתר: עוברים לתיקייה הפרטית (מוגשים רק אחרי כניסה)
if [ -f "$NEW/data/leads.json" ]; then install_data "$NEW/data/leads.json"; fi
rm -rf "$NEW/data"

# החלפה: הגרסה שבאוויר עוברת הצידה (לחזרה מהירה), והחדשה נכנסת במקומה
rm -rf "$PREV"
if [ -e "$TARGET" ]; then mv "$TARGET" "$PREV"; fi
mv "$NEW" "$TARGET"
echo "הדשבורד עודכן לגרסה $REL"
