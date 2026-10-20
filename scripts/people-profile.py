"""לידים לפי אדם (טלפון) מול לפי הגעה (קוד מזהה). ספירות בלבד, בלי פרטים אישיים.

  python3 scripts/people-profile.py SHEET_ID [TAB]

הגעה = קוד מזהה אחד (שורות כפולות של אותו קוד מתאחדות, ונשארת השורה המלאה יותר, כמו בדשבורד).
אדם = 9 הספרות האחרונות של הטלפון.
"""
import collections, csv, io, re, sys, urllib.parse, urllib.request
from datetime import datetime

SHEET = sys.argv[1]
TAB = sys.argv[2] if len(sys.argv) > 2 else 'לידים'
url = f'https://docs.google.com/spreadsheets/d/{SHEET}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(TAB)}'
rows = list(csv.reader(io.StringIO(urllib.request.urlopen(url, timeout=60).read().decode('utf-8-sig'))))
h = rows[0]
data = [r for r in rows[1:] if any(c.strip() for c in r)]


def col(name):
    i = h.index(name)
    return [(r[i].strip() if i < len(r) else '') for r in data]


def parse(d):
    for f in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y'):
        try:
            return datetime.strptime(d, f)
        except ValueError:
            pass
    return None


ns, phone = col('קוד מזהה'), col('טלפון')
dates = [parse(d) for d in col('תאריך כניסה')]
ans, qs, res, proc = col("ענה לצ'אטבוט?"), [q.lower() for q in col('סטטוס שאלון')], col('סטטוס'), col('שם תהליך')
filled = [sum(1 for c in r if c.strip()) for r in data]

groups = collections.defaultdict(list)
for i, v in enumerate(ns):
    groups[v or f'row{i}'].append(i)
arrivals = [max(idx, key=lambda i: (filled[i], -i)) for idx in groups.values()]
arrivals = [i for i in arrivals if dates[i]]

person_of = {i: re.sub(r'\D', '', phone[i])[-9:] or f'ns:{ns[i]}' for i in arrivals}
people = collections.defaultdict(list)
for i in arrivals:
    people[person_of[i]].append(i)
for v in people.values():
    v.sort(key=lambda i: dates[i])

bought = lambda i: qs[i] in ('converted', 'payment')
out = []
multi = {k: v for k, v in people.items() if len(v) > 1}
out.append(f'הגעות (לידים היום): {len(arrivals)}; אנשים שונים לפי טלפון: {len(people)}; הפרש: {len(arrivals) - len(people)}')
dist = collections.Counter(min(len(v), 4) for v in multi.values())
out.append(f'אנשים שהגיעו יותר מפעם אחת: {len(multi)} (פעמיים {dist[2]}, 3 פעמים {dist[3]}, 4 ומעלה {dist[4]})')
gaps = collections.Counter()
for v in multi.values():
    s = (dates[v[-1]] - dates[v[0]]).total_seconds()
    gaps['אותו יום' if dates[v[-1]].date() == dates[v[0]].date() else 'עד שבוע' if s <= 7 * 86400 else 'עד חודש' if s <= 30 * 86400 else 'יותר מחודש'] += 1
out.append('הזמן בין ההגעה הראשונה לאחרונה: ' + ', '.join(f'{k} {n}' for k, n in gaps.most_common()))
out.append('בהגעה הראשונה של מי שחזר: ' + '; '.join(f'{k or "ריק"} {n}' for k, n in collections.Counter(qs[v[0]] for v in multi.values()).most_common(5)))
out.append('בהגעות הבאות: ' + '; '.join(f'{k or "ריק"} {n}' for k, n in collections.Counter(qs[i] for v in multi.values() for i in v[1:]).most_common(5)))
out.append('תהליך בהגעות הבאות: ' + '; '.join(f'{k or "ריק"} {n}' for k, n in collections.Counter(proc[i] for v in multi.values() for i in v[1:]).most_common(4)))
out.append(f'ענו לבוט בהגעות הבאות: {sum(1 for v in multi.values() for i in v[1:] if ans[i])} מתוך {sum(len(v) - 1 for v in multi.values())}')

pa = sum(1 for i in arrivals if bought(i))
pp = sum(1 for v in people.values() if any(bought(i) for i in v))
pp2 = sum(1 for v in people.values() if sum(1 for i in v if bought(i)) > 1)
later = sum(1 for v in multi.values() if not bought(v[0]) and any(bought(i) for i in v[1:]))
out.append(f'רכישות (הגעות עם converted או payment): {pa}; אנשים שרכשו: {pp}; אנשים שרכשו יותר מפעם אחת: {pp2}; לא רכשו בפעם הראשונה ורכשו בהגעה מאוחרת: {later}')
out.append(f'ענו לבוט: הגעות {sum(1 for i in arrivals if ans[i])}, אנשים {sum(1 for v in people.values() if any(ans[i] for i in v))}')
passed = sum(1 for v in people.values() if any(res[i] == 'עבר' for i in v))
failed = sum(1 for v in people.values() if not any(res[i] == 'עבר' for i in v) and any(res[i] == 'לא עבר' for i in v))
out.append(f'עברו: הגעות {sum(1 for i in arrivals if res[i] == "עבר")}, אנשים {passed}; נכשלו: הגעות {sum(1 for i in arrivals if res[i] == "לא עבר")}, אנשים (שלא עברו אף פעם) {failed}')
fail_then_pass = sum(1 for v in multi.values() if res[v[0]] == 'לא עבר' and any(res[i] == 'עבר' for i in v[1:]))
out.append(f'נכשלו בפעם הראשונה ועברו בהגעה מאוחרת: {fail_then_pass}')

print('\n'.join(out))
parts, cur = [], ''
for line in out:
    if len((cur + line).encode()) > 2500 and cur:
        parts.append(cur)
        cur = ''
    cur += line + '\n'
parts.append(cur)
for n, part in enumerate(parts, 1):
    part = part.replace('%', '%25').replace('\r', '').replace('\n', '%0A')
    print(f'::notice title=לידים לפי אדם {n}/{len(parts)}::{part}')
