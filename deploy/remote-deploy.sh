#!/usr/bin/env bash
# רץ על השרת אחרי כל העלאה. מחליף את הגרסה הפעילה ומפעיל מחדש את הדשבורד.
# שימוש: remote-deploy.sh <release>
#
# השרת יכול להחזיק אתרים ואפליקציות אחרים של אותו משתמש. הסקריפט נוגע רק בדברים של הדשבורד:
# התיקייה ~/apps/osher-max-dashboard והתהליך osher-max-dashboard ב-pm2.
set -euo pipefail

APP=osher-max-dashboard
BASE="$HOME/apps/$APP"
REL="$1"
PORT_APP="${APP_PORT:-3100}"

# אם Node מותקן דרך nvm של המשתמש, טוענים אותו (nvm לא אוהב set -eu)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +eu
  . "$HOME/.nvm/nvm.sh" >/dev/null
  set -eu
fi

if ! command -v node >/dev/null; then
  echo "אין Node על השרת. צריך Node 20 ומעלה." >&2
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $NODE_MAJOR ישן מדי. צריך 20 ומעלה." >&2
  exit 1
fi

# פתוח = משהו מקבל חיבורים בפורט. עובד גם בלי ss.
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT_APP") 2>/dev/null; }
is_ours() { curl -fsS --max-time 3 "http://127.0.0.1:$PORT_APP/api/health" 2>/dev/null | grep -q "\"app\":\"$APP\""; }

# אם מישהו אחר כבר יושב על הפורט, עוצרים בלי לגעת בכלום
if port_in_use && ! is_ours; then
  echo "פורט $PORT_APP תפוס על ידי אפליקציה אחרת בשרת. לא נגעתי בה. צריך לבחור פורט אחר (APP_PORT)." >&2
  exit 1
fi

# pm2 שומר על התהליך חי ומפעיל אותו מחדש אחרי נפילה. מותקן אצל המשתמש, בלי root.
export PATH="$HOME/.local/bin:$PATH"
if ! command -v pm2 >/dev/null; then
  npm install -g --prefix "$HOME/.local" pm2 >/dev/null
fi

# קובץ הסביבה יושב רק על השרת, מחוץ לגרסאות
if [ -f "$BASE/.env" ]; then cp "$BASE/.env" "$BASE/releases/$REL/.env"; fi

PREV=$(readlink "$BASE/current" 2>/dev/null || true)

start() {
  # pm2 זוכר את התיקייה שבה התחיל, אז מוחקים ומפעילים מחדש מהתיקייה של הגרסה
  pm2 delete "$APP" >/dev/null 2>&1 || true
  (cd "$1" && PORT="$PORT_APP" HOSTNAME=127.0.0.1 pm2 start server.js --name "$APP" --cwd "$1" >/dev/null)
  ln -sfn "$1" "$BASE/current"
}

wait_ours() {
  for _ in $(seq 1 20); do
    if is_ours; then return 0; fi
    sleep 2
  done
  return 1
}

start "$BASE/releases/$REL"
if wait_ours; then
  pm2 save >/dev/null
  echo "הדשבורד עלה: גרסה $REL, פורט $PORT_APP"
  # שומרים חמש גרסאות אחרונות של הדשבורד, בתיקייה שלו בלבד
  ls -1dt "$BASE"/releases/* | tail -n +6 | xargs -r rm -rf
  exit 0
fi

echo "הדשבורד לא ענה אחרי ההפעלה. לוג: pm2 logs $APP" >&2
if [ -n "$PREV" ] && [ -d "$PREV" ] && [ "$PREV" != "$BASE/releases/$REL" ]; then
  echo "מחזיר את הגרסה הקודמת: $(basename "$PREV")" >&2
  start "$PREV"
  if wait_ours; then pm2 save >/dev/null; exit 1; fi
fi
# שום גרסה לא עלתה: עוצרים את הדשבורד, כדי שלא ינסה לעלות שוב ושוב ויכביד על השרת
pm2 delete "$APP" >/dev/null 2>&1 || true
pm2 save >/dev/null 2>&1 || true
echo "הדשבורד עצור. שאר האתרים בשרת לא הושפעו." >&2
exit 1
