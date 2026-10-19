"""פרופיל של לשונית הלידים: רק ספירות ושמות של קטגוריות. בלי שמות, טלפונים ומיילים."""
import csv, collections, io, re, sys, urllib.request, urllib.parse
from datetime import datetime

SHEET = sys.argv[1]
TAB = sys.argv[2] if len(sys.argv) > 2 else 'לידים'
url = f'https://docs.google.com/spreadsheets/d/{SHEET}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(TAB)}'
text = urllib.request.urlopen(url, timeout=60).read().decode('utf-8')
rows = list(csv.reader(io.StringIO(text)))
h = rows[0]
data = [r for r in rows[1:] if any(c.strip() for c in r)]
KNOWN = set('''תאריך כניסה,קוד מזהה,שם לקוח,טלפון,מייל,מקור הגעה,סטטוס,הסיר את עצמו?,ענה לצ'אטבוט?,לינק לשיחה,שלב בשאלון,סטטוס שאלון,שם תהליך,ניקוד לקוח,הערות,מבחן,תשובה 1,תשובה 2,תשובה 3,תשובה 4,תשובה 5,תשובה 6,תשובה 7,תשובה 8,תשובה 9,תשובה 10,תשובה 11,תשובה 12,תשובה 13,תשובה 14,תשובה 15,Reserved 1,Reserved 2,Reserved 3,Reserved 4,Reserved 5,Reserved 6,מוצר שנקנה,סכום ששולם,כמות יח',תשלומים,מזהה תשלום,דף תשלום,קופון,דירוג חוויה,ממליץ,הערות ממליץ,Reserved 8,תאריך,שעה,מיקום,מזהה אירוע,שם בוטקאסט,מספר בוטקאסט,תאריך תגובה'''.split(','))
new_cols = [f'{i}:{c}' for i, c in enumerate(h) if c not in KNOWN]
out = [f'עמודות: {len(h)}; חדשות או ששמן השתנה: ' + (', '.join(new_cols) or 'אין'), f'שורות עם נתונים: {len(data)}',
       f'שורות באורך שונה מהכותרת: {sum(1 for r in data if len(r) != len(h))}']

def col(name):
    i = h.index(name)
    return [(r[i].strip() if i < len(r) else '') for r in data]

def top(name, n=10):
    c = collections.Counter(col(name))
    empty = c.pop('', 0)
    return f'{name}: ריקים {empty}; ' + '; '.join(f'{k} ({v})' for k, v in c.most_common(n))

for name in [c for c in h if c not in KNOWN] + ['מקור הגעה', 'סטטוס', 'הסיר את עצמו?', 'סטטוס שאלון', 'שם תהליך', 'מוצר שנקנה', 'תשלומים', 'מבחן', 'שם בוטקאסט', 'מספר בוטקאסט']:
    if name in h:
        out.append(top(name))

amt = [a for a in col('סכום ששולם') if a]
out.append(f'סכום ששולם: מלאים {len(amt)}; דוגמאות פורמט: ' + ' | '.join(sorted({re.sub(r"\d", "9", a) for a in amt})[:8]))
qs, amts, prods = col('סטטוס שאלון'), col('סכום ששולם'), col('מוצר שנקנה')
conv = sum(1 for q in qs if q.lower() == 'converted')
paid_any = sum(1 for a, p in zip(amts, prods) if a or p)
conv_paid = sum(1 for q, a, p in zip(qs, amts, prods) if q.lower() == 'converted' and (a or p))
out.append(f'converted: {conv}; עם סכום או מוצר: {paid_any}; converted שיש להם גם סכום או מוצר: {conv_paid}')

for i in range(16, 32):
    if i < len(h):
        c = collections.Counter(col(h[i])); c.pop('', None)
        out.append(f'{h[i]}: {sum(c.values())} מלאים, {len(c)} ערכים שונים; נפוצים: ' + '; '.join(k[:25] for k, _ in c.most_common(4)))

def parse(d):
    for f in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y'):
        try:
            return datetime.strptime(d, f)
        except ValueError:
            pass
    return None

dates = col('תאריך כניסה')
pd = [parse(d) for d in dates]
out.append(f'תאריכים שלא פוענחו: {sum(1 for d, p in zip(dates, pd) if d and not p)}; דוגמאות פורמט: ' + ' | '.join(sorted({re.sub(r"\d", "9", d) for d in dates if d})[:5]))
months = collections.Counter(p.strftime('%Y-%m') for p in pd if p)
out.append('לפי חודש: ' + ', '.join(f'{k}: {v}' for k, v in sorted(months.items())))

phones, mails = col('טלפון'), col('מייל')
groups = collections.defaultdict(list)
for i, (ph, m) in enumerate(zip(phones, mails)):
    key = re.sub(r'\D', '', ph)[-9:] or m.lower()
    if key and pd[i]:
        groups[key].append(i)
filled = [sum(1 for c in r if c.strip()) for r in data]
multi = sum(1 for v in groups.values() if len(v) > 1)
gaps = collections.Counter()
for v in groups.values():
    v = sorted(v, key=lambda i: pd[i])
    for a, b in zip(v, v[1:]):
        s = (pd[b] - pd[a]).total_seconds()
        gaps['0 שניות' if s == 0 else 'עד 10 שניות' if s <= 10 else 'עד 60 שניות' if s <= 60 else 'עד 10 דקות' if s <= 600 else 'מעל 10 דקות'] += 1
out.append(f'משתמשים ייחודיים: {len(groups)}; עם יותר משורה: {multi}; פערים בין שורות של אותו משתמש: ' + ', '.join(f'{k}: {v}' for k, v in gaps.items()))
out.append(f'יש שניות בתאריך הכניסה: {"כן" if any(d.count(":") == 2 for d in dates) else "לא, רק דקות"}')

# הצלבה: סטטוס שאלון מול מוצר וסכום
def num(a):
    a = re.sub(r'[^\d.]', '', a)
    try:
        return float(a) if a else None
    except ValueError:
        return None
cross = collections.defaultdict(lambda: collections.Counter())
sums = collections.defaultdict(list)
for q, a, p in zip(qs, amts, prods):
    q = q.lower() or '(ריק)'
    n = num(a)
    prod = 'מוצר אמיתי' if p and p != '-' else ('מוצר "-"' if p == '-' else 'בלי מוצר')
    cross[q][prod + (', סכום>0' if n and n > 0 else ', סכום 0' if n == 0 else ', בלי סכום')] += 1
    if n:
        sums[q].append(n)
for q, c in cross.items():
    s = sums.get(q, [])
    out.append(f'סטטוס שאלון {q}: ' + '; '.join(f'{k} ({v})' for k, v in c.most_common()) + (f' | סכומים: ממוצע {sum(s)/len(s):.0f}, מינ {min(s):.0f}, מקס {max(s):.0f}' if s else ''))
st = col('סטטוס')
x = collections.Counter((s or '(ריק)', (q.lower() or '(ריק)')) for s, q in zip(st, qs))
out.append('סטטוס מול סטטוס שאלון: ' + '; '.join(f'{a}/{b} ({v})' for (a, b), v in x.most_common(12)))

print('\n'.join(out))

# בדיקת כלל הכפילויות: מה יש בשורה שנזרקת לעומת זו שנשארת
WIN = 10
qi, ai, pi = h.index('סטטוס שאלון'), h.index('סכום ששולם'), h.index('מוצר שנקנה')
cmp = collections.Counter()
for v in groups.values():
    v = sorted(v, key=lambda i: (pd[i], i))
    cl = [v[0]]
    def judge(cl):
        if len(cl) < 2:
            return
        keep = max(cl, key=lambda i: (filled[i], -i))
        for d in cl:
            if d == keep:
                continue
            kq, dq = data[keep][qi].strip().lower(), data[d][qi].strip().lower()
            ka, da = data[keep][ai].strip(), data[d][ai].strip()
            same = all(data[keep][j].strip() == data[d][j].strip() for j in range(len(h)) if j not in (h.index('קוד מזהה'), h.index('לינק לשיחה')))
            tag = 'זהות לגמרי' if same else f'נשארת {kq or "ריק"}/{"סכום" if ka else "בלי"} מול נזרקת {dq or "ריק"}/{"סכום" if da else "בלי"}'
            cmp[tag] += 1
    for a, b in zip(v, v[1:]):
        if (pd[b] - pd[a]).total_seconds() <= WIN:
            cl.append(b)
        else:
            judge(cl); cl = [b]
    judge(cl)
print('כפילויות לפי הכלל (10 שניות): ' + '; '.join(f'{k} ({c})' for k, c in cmp.most_common(12)))

# חריגים: ערכים נדירים בעמודות של קטגוריות, עם מספר השורה בגיליון (בלי פרטים אישיים)
rownum = [i + 2 for i, r in enumerate(rows[1:]) if any(c.strip() for c in r)]
rare_out = []
for name in ['מקור הגעה', 'סטטוס', 'סטטוס שאלון', 'שם תהליך', 'התחיל שיחה', 'אופן שיחה', "ענה לצ'אטבוט?"]:
    if name not in h:
        continue
    vals = col(name)
    for v, k in collections.Counter(vals).items():
        if v and k <= 3:
            where = [rownum[i] for i, x in enumerate(vals) if x == v][:5]
            rare_out.append(f'{name} = "{v[:40]}" ({k}): שורות {", ".join(map(str, where))}')
old = [(rownum[i], d) for i, (d, p) in enumerate(zip(dates, pd)) if p and p.year < 2026]
rare_out.append('שורות לפני 2026: ' + ('; '.join(f'שורה {r} ({d[:10]})' for r, d in old) or 'אין'))
filled_new = {name: sum(1 for v in col(name) if v) for name in ['התחיל שיחה', 'אופן שיחה'] if name in h}
rare_out.append('עמודות הסוכן, כמה מלאות: ' + ', '.join(f'{k}: {v}' for k, v in filled_new.items()))
print('\n'.join(['חריגים:'] + rare_out))

# שורות חשודות: אילו עמודות מלאות (שמות בלבד), וערכים לא אישיים
PII = {'שם לקוח', 'טלפון', 'מייל', 'לינק לשיחה', 'הערות', 'קוד מזהה', 'הערות ממליץ'}
susp = sorted({rownum[i] for i, v in enumerate(col('מקור הגעה')) if v and v not in ("אורגני - צ'אטבוט וואטסאפ", 'צאטבוט')})
for rn in susp[:5]:
    r = rows[rn - 1]
    cells = [(h[j] if j < len(h) else f'#{j}', v.strip()) for j, v in enumerate(r) if v.strip()]
    shown = [f'{k}={v[:30]}' if k not in PII else f'{k}=(מלא)' for k, v in cells]
    print(f'שורה {rn}: {len(r)} תאים; מלאות: ' + ' | '.join(shown))
# שורה תקינה אחרונה להשוואה
last_ok = max(rownum[i] for i, v in enumerate(col('מקור הגעה')) if v == "אורגני - צ'אטבוט וואטסאפ")
r = rows[last_ok - 1]
print(f'להשוואה, שורה תקינה {last_ok}: מלאות: ' + ' | '.join((h[j] if j < len(h) else f'#{j}') + ('=(מלא)' if h[j] in PII else '=' + v.strip()[:20]) for j, v in enumerate(r) if v.strip() and j < len(h)))
