#!/usr/bin/env bash
# רץ על השרת אחרי כל העלאה. מחליף את הגרסה הפעילה ומפעיל מחדש את הדשבורד.
# שימוש: remote-deploy.sh <release>
set -euo pipefail

APP=osher-max-dashboard
BASE="$HOME/apps/$APP"
REL="$1"
PORT_APP="${APP_PORT:-3100}"

# אם Node מותקן דרך nvm של המשתמש, טוענים אותו
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null

if ! command -v node >/dev/null; then
  echo "אין Node על השרת. צריך Node 20 ומעלה." >&2
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $NODE_MAJOR ישן מדי. צריך 20 ומעלה." >&2
  exit 1
fi

# pm2 שומר על התהליך חי ומפעיל אותו מחדש אחרי נפילה. מותקן אצל המשתמש, בלי root.
export PATH="$HOME/.local/bin:$PATH"
if ! command -v pm2 >/dev/null; then
  npm install -g --prefix "$HOME/.local" pm2 >/dev/null
fi

# קובץ הסביבה יושב רק על השרת, מחוץ לגרסאות
[ -f "$BASE/.env" ] && cp "$BASE/.env" "$BASE/releases/$REL/.env"

ln -sfn "$BASE/releases/$REL" "$BASE/current"

# pm2 זוכר את התיקייה שבה התחיל, אז מוחקים ומפעילים מחדש מהגרסה החדשה
cd "$BASE/releases/$REL"
pm2 delete "$APP" >/dev/null 2>&1 || true
PORT="$PORT_APP" HOSTNAME=127.0.0.1 pm2 start server.js --name "$APP" --cwd "$BASE/releases/$REL"
pm2 save >/dev/null

# בדיקה שהדשבורד עונה
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:$PORT_APP/" >/dev/null 2>&1; then
    echo "הדשבורד עלה: גרסה $REL, פורט $PORT_APP"
    # שומרים חמש גרסאות אחרונות
    ls -1dt "$BASE"/releases/* | tail -n +6 | xargs -r rm -rf
    exit 0
  fi
  sleep 2
done
echo "הדשבורד לא ענה אחרי ההפעלה. לוג: pm2 logs $APP" >&2
exit 1
