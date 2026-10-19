# דשבורד אושר מקס

דשבורד לאושר מקס, שמציג במקום אחד את הנתונים מטבלאות הגוגל שיטס הקיימות ומתעדכן לבד כשהן משתנות.

## איפה הכול נמצא

| מה | איפה |
|---|---|
| הסבר כללי על הפרויקט | [docs/PROJECT.md](docs/PROJECT.md) |
| ציר זמן והתקדמות | [docs/TIMELINE.md](docs/TIMELINE.md) |
| איפה הדברים עומדים עכשיו | [docs/HANDOFF.md](docs/HANDOFF.md) |
| החלטות של מנהל הפרויקט | [docs/DECISIONS.md](docs/DECISIONS.md) |
| סביבות, פריסה ולוגים | [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) |
| סיכונים פתוחים | [docs/RISKS.md](docs/RISKS.md) |
| חוקים לסוכני AI | [AGENTS.md](AGENTS.md) |
| המשימות | ה-issues של הריפו, ולוח הבקרה המוצמד |

## איך עובדים

- כל משימה, באג, בקשה ושאלה היא issue.
- סוכן AI עובד על התור לפי עדיפות, ומדווח על כל משימה שסיים.
- מנהל הפרויקט (@Eliel-tr1) בודק, מאשר וסוגר.
- הפירוט המלא נמצא ב-[AGENTS.md](AGENTS.md).

## הרצה מקומית

צריך Node 20 ומעלה.

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # טיפוסים, בדיקות ובנייה. חייב לעבור לפני כל קומיט
```

כרגע הדשבורד מציג נתוני הדגמה מומצאים. הקריאה מהטבלה האמיתית תיכנס ב-#9.

## פריסה
כשיוגדר שרת היעד, כל דחיפה ל-main תיבנה, תיבדק ותעלה לשרת לבד. עד אז הפריסה כבויה. הפירוט ב-[docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).
