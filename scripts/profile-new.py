"""פרופיל של העמודות והלשוניות החדשות (31/10/2026): רק כותרות, ספירות ופורמטים.
בלי שמות, טלפונים, מיילים, קודים מזהים, קישורים או קודי קופון אישיים. ערך חופשי מוצג רק אם הוא חוזר לפחות פעמיים."""
import csv, collections, io, re, sys, urllib.request

SHEET = sys.argv[1]
TABS = {'רכישות': '282711056', 'לידים': '0', 'דיוורים': '704173708', 'דיוורים - סיכום': '359996576'}
PERSONAL = re.compile(r'שם|טלפון|מייל|קוד מזהה|לינק|קישור לשיחה|מזהה תשלום|דף תשלום|^לינק$')
PTB = re.compile(r'^PTB-[0-9A-F]{10}$', re.I)


def load(gid):
    url = f'https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}'
    try:
        text = urllib.request.urlopen(url, timeout=90).read().decode('utf-8-sig')
    except Exception as e:  # noqa: BLE001
        return None, str(e)
    if text.lstrip().startswith('<'):
        return None, 'html'
    rows = list(csv.reader(io.StringIO(text)))
    return rows, None


def shape(v):
    return re.sub(r'[A-Za-z]', 'a', re.sub(r'\d', '9', v))


out = []
for tab, gid in TABS.items():
    rows, err = load(gid)
    if err:
        out.append(f'## {tab}: לא נקרא ({err})')
        continue
    h = [c.strip() for c in rows[0]]
    data = [r for r in rows[1:] if any(c.strip() for c in r)]
    out.append(f'## {tab}: {len(h)} עמודות, {len(data)} שורות')
    out.append('כותרות: ' + ' | '.join(f'{i}:{c}' for i, c in enumerate(h)))

    def col(name):
        i = h.index(name)
        return [(r[i].strip() if i < len(r) else '') for r in data]

    if tab == 'לידים':
        names = [c for c in ['utm_campaign', 'הודעות לקוח', 'קופון הבוט', 'תאריך קופון', 'התחיל שיחה', 'אופן שיחה'] if c in h]
    elif tab == 'רכישות':
        names = [c for c in h if c in ('של הבוט', 'סיבה', 'utm_campaign', 'קופון מהרכישה', 'מקור הגעה', 'תאריך')]
    else:
        names = [c for c in h if not PERSONAL.search(c)]
    for name in names:
        vals = col(name)
        c = collections.Counter(vals)
        empty = c.pop('', 0)
        if name in ('קופון הבוט',):
            ptb = sum(v for k, v in c.items() if PTB.match(k))
            out.append(f'- {name}: ריקים {empty}; מלאים {sum(c.values())}; בפורמט PTB {ptb}; צורות אחרות: ' + '; '.join(f'{k} ({v})' for k, v in collections.Counter(shape(k) for k in c if not PTB.match(k)).most_common(5)))
            continue
        if name in ('תאריך', 'תאריך קופון', 'תאריך שליחה', 'תאריך רכישה'):
            out.append(f'- {name}: ריקים {empty}; צורות: ' + '; '.join(f'{k} ({v})' for k, v in collections.Counter(shape(k) for k in vals if k).most_common(5)))
            if name == 'תאריך' and tab == 'רכישות':
                days = collections.Counter(k[:10] for k in vals if k)
                out.append('  ימים (dd/mm): ' + ', '.join(f'{d[:5]}:{n}' for d, n in sorted(days.items(), key=lambda x: (x[0][6:10], x[0][3:5], x[0][:2]))))
            continue
        if name == 'קופון מהרכישה':
            norm = collections.Counter()
            for v in vals:
                m = re.search(r'"code"\s*:\s*"([^"]*)"', v)
                code = (m.group(1) if m else v).strip().upper()
                if code in ('', '-', 'EMPTY'):
                    code = '(בלי)'
                elif PTB.match(code):
                    code = '(PTB אישי)'
                norm[code] += 1
            kinds = collections.Counter('json' if v.startswith('{') else ('ריק' if not v else ('empty' if v.lower() == 'empty' else ('-' if v == '-' else 'טקסט'))) for v in vals)
            out.append(f'- {name}: סוגים {dict(kinds)}; קודים: ' + '; '.join(f'{k} ({v})' for k, v in norm.most_common(25) if v >= 2))
            continue
        shown = [(k, v) for k, v in c.most_common(40) if v >= 2 or len(c) <= 30]
        out.append(f'- {name}: ריקים {empty}; שונים {len(c)}; ' + '; '.join(f'{k} ({v})' for k, v in shown))
    if tab == 'רכישות' and 'של הבוט' in h and 'סיבה' in h:
        x = collections.Counter(zip(col('של הבוט'), col('סיבה')))
        out.append('- של הבוט x סיבה: ' + '; '.join(f'{a or "ריק"}/{b or "ריק"} ({n})' for (a, b), n in x.most_common()))
    if tab == 'דיוורים - סיכום':
        for r in data:
            out.append('  שורה: ' + ' | '.join(r))

print('\n'.join(out))
