#!/usr/bin/env bash
# רץ על השרת אחרי כל העלאה: מחליף את התיקייה oshermax באתר בגרסה החדשה.
# שימוש: static-deploy.sh <גרסה> <קובץ-ההעלאה>
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
