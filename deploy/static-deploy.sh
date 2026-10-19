#!/usr/bin/env bash
# רץ על השרת אחרי כל העלאה.
#   static-deploy.sh <גרסה> <קובץ-ההעלאה>   מחליף את התיקייה oshermax באתר בגרסה חדשה של הדשבורד
#   static-deploy.sh data <leads.json>       מחליף רק את קובץ הנתונים (כל 5 דקות)
#
# באתר יש פרויקטים חיים אחרים. הסקריפט נוגע רק ב:
#   <האתר>/oshermax                      - הדשבורד עצמו
#   ~/.cache/osher-max-dashboard         - העלאות, הגרסה החדשה לפני ההחלפה, והגרסה הקודמת
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

fail() { echo "$1" >&2; rm -f "$ARCHIVE"; exit 1; }

[ -d "$SITE" ] || fail "תיקיית האתר לא נמצאה. לא נגעתי בכלום."
[ -w "$SITE" ] || fail "אין הרשאת כתיבה לתיקיית האתר. לא נגעתי בכלום."
if [ -L "$TARGET" ] || { [ -e "$TARGET" ] && [ ! -f "$TARGET/$MARK" ]; }; then
  fail "בתיקייה $NAME באתר יש משהו שלא אנחנו העלינו. לא נגעתי בה."
fi

if [ "$REL" = data ]; then
  # עדכון נתונים בלבד: רק לתוך דשבורד שכבר באוויר, ורק קובץ שנראה תקין
  [ -f "$TARGET/$MARK" ] || fail "הדשבורד עוד לא באוויר. לא נגעתי בכלום."
  [ -s "$ARCHIVE" ] && head -c 200 "$ARCHIVE" | grep -q '"version":1' && grep -q '"leads":\[' "$ARCHIVE" \
    || fail "קובץ הנתונים שהועלה לא תקין. הנתונים שבאוויר נשארו כמו שהם."
  mkdir -p "$TARGET/data"
  cp "$ARCHIVE" "$TARGET/data/.leads.json.tmp"
  mv -f "$TARGET/data/.leads.json.tmp" "$TARGET/data/leads.json"
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

# החלפה: הגרסה שבאוויר עוברת הצידה (לחזרה מהירה), והחדשה נכנסת במקומה
rm -rf "$PREV"
if [ -e "$TARGET" ]; then mv "$TARGET" "$PREV"; fi
mv "$NEW" "$TARGET"
echo "הדשבורד עודכן לגרסה $REL"
