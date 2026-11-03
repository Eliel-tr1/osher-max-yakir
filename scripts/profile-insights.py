"""פרופיל של לשוניות "תובנות שיחה" (הנחיית המנהל 3/11/2026): כותרות, ספירות וצורות בלבד.
ערכים מודפסים רק כשהם ברשימת הקטגוריות הידועה מההנחיה. טקסט חופשי, שמות, קודים מזהים, שאלות ותשובות לא מודפסים אף פעם:
ההערות של הריצה ציבוריות (ראו #25)."""
import csv, collections, io, re, sys, urllib.request

SHEET = sys.argv[1]
TABS = {'ניתוח שיחות': '710427304', 'שאלות לסוכן': '613597171', 'פניות': '1189797577', 'משובים': '1067761873', 'לידים': '0'}

KNOWN = {
    'מסלול': {'מבחן - עבר', 'מבחן - לא עבר', 'פופאפ', 'תהליך ראשי', 'הרשמה לאתגר'},
    'קנה': {'כן', 'לא'},
    'פנה לנציג': {'כן', 'לא'},
    'שלב אחרון': {'לא התחיל שאלון', 'התחיל שאלון', 'סיים שאלון', 'הגיע לתשלום', 'רכש בבוט', 'אחרי מבחן', 'רכש'},
    'סיבת נטישה': {'הפסיק לענות בשאלון', 'נרתע מהמחיר והתוספים', 'הבוט לא נתן מענה או הבטיח ולא קיים', 'קיבל קישור או קופון ולא רכש',
                   'נכשל במבחן ועזב', 'קושי טכני ברכישה', 'חוסר תקציב', 'תסכול מהפרה או חסימה', 'רצה רק קופון הנחה',
                   'אמר שיחזור או ימשיך לבדוק', 'חוסר אמון או מעבר לחברה אחרת', 'אחר', 'לא כתב לבוט', 'הודעה בודדת בלבד',
                   'רכש בלי שיחה', 'אין נטישה - רכש', 'שיחת בדיקה', 'לא ברור מהסיכום'},
    'קטגוריית פנייה': {'הפעלת חשבון ושדרוג', 'תקלה טכנית בפלטפורמה', 'ערעור על חוקים והפרות', 'מכירות והנחות', 'חסימת מסחר בחשבון',
                       'תשלומים וחיובים', 'בקשת נציג כללית', 'שאלת מוצר ותוספים', 'אחר'},
    'קטגוריית משוב': {'בקשת תנאים גמישים', 'תוכנית לניסיון הבא', 'חוקים לא ברורים', 'טעות אישית במסחר', 'שבע רצון ללא הערות',
                      'בקשת מידע והכוונה', 'אחר'},
    'מקור הסיבה': {"צ'אט", 'סיכום', "בלי צ'אט"},
    'סטטוס': {'ממתין לתשובה', 'נענה', 'עודכן במאגר'},
    'קטגוריה(שאלות)': {'חוקי תוכנית ומסחר', 'קופונים ומבצעים', 'מחירי תוספים', 'הפעלת חשבון וגישה', 'אחר'},
    'מבחן': {'עבר', 'לא עבר'},
}
KNOWN['קטגוריה(פניות)'] = KNOWN['קטגוריית פנייה']
KNOWN['קטגוריה(משובים)'] = KNOWN['קטגוריית משוב']
STEP_N = re.compile(r'^התחיל שאלון \(שלב (\d+)\)$')


def load(gid):
    url = f'https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}'
    try:
        text = urllib.request.urlopen(url, timeout=90).read().decode('utf-8-sig')
    except Exception as e:  # noqa: BLE001
        return None, type(e).__name__
    if text.lstrip().startswith('<'):
        return None, 'html'
    return list(csv.reader(io.StringIO(text))), None


def shape(v):
    return re.sub(r'[A-Za-z]', 'a', re.sub(r'\d', '9', v))


def known_counts(vals, key):
    c = collections.Counter(v for v in vals)
    empty = c.pop('', 0)
    ok = KNOWN[key]
    steps = collections.Counter()
    if key == 'שלב אחרון':
        for k in list(c):
            m = STEP_N.match(k)
            if m:
                steps[int(m.group(1))] += c.pop(k)
    shown = '; '.join(f'{k} ({v})' for k, v in c.most_common() if k in ok)
    other = {k: v for k, v in c.items() if k not in ok}
    tail = f'; ערכים לא מוכרים: {len(other)} שונים, {sum(other.values())} שורות' if other else ''
    st = f'; התחיל שאלון (שלב N): ' + ', '.join(f'{k}:{v}' for k, v in sorted(steps.items())) if steps else ''
    return f'ריקים {empty}; {shown}{st}{tail}'


out = []
tabs = {}
for tab, gid in TABS.items():
    rows, err = load(gid)
    if err:
        out.append(f'## {tab}: לא נקרא ({err})')
        continue
    h = [c.strip() for c in rows[0]]
    data = [r for r in rows[1:] if any(c.strip() for c in r)]
    tabs[tab] = (h, data)
    out.append(f'## {tab}: {len(h)} עמודות, {len(data)} שורות')
    out.append('כותרות: ' + ' | '.join(f'{i}:{c}' for i, c in enumerate(h)))


def col(tab, name):
    h, data = tabs[tab]
    if name not in h:
        return None
    i = h.index(name)
    return [(r[i].strip() if i < len(r) else '') for r in data]


def fill(tab):
    """לכל עמודה: כמה מלאים ואורך ממוצע, בלי הערכים"""
    h, data = tabs[tab]
    parts = []
    for i, name in enumerate(h):
        vals = [(r[i].strip() if i < len(r) else '') for r in data]
        full = [v for v in vals if v]
        avg = round(sum(len(v) for v in full) / len(full)) if full else 0
        parts.append(f'{i}:{name or "(בלי שם)"} מלאים {len(full)}, אורך ממוצע {avg}')
    out.append(f'מילוי ב{tab}: ' + ' | '.join(parts))


def dates(tab, name):
    vals = col(tab, name)
    if vals is None:
        out.append(f'- {name}: אין עמודה')
        return
    c = collections.Counter(shape(v) for v in vals if v)
    out.append(f'- {name}: ריקים {sum(1 for v in vals if not v)}; צורות: ' + '; '.join(f'{k} ({v})' for k, v in c.most_common(6)))
    # טווח (יום/חודש בלבד)
    days = sorted({(v[6:10], v[3:5], v[:2]) for v in vals if re.match(r'^\d{2}/\d{2}/\d{4}', v)})
    if days:
        out.append(f'  טווח (בצורה dd/mm/yyyy): {days[0][2]}/{days[0][1]}/{days[0][0]} עד {days[-1][2]}/{days[-1][1]}/{days[-1][0]}')


leads_ns = set(col('לידים', 'קוד מזהה') or []) if 'לידים' in tabs else set()

if 'ניתוח שיחות' in tabs:
    t = 'ניתוח שיחות'
    fill(t)
    for name in ['מסלול', 'קנה', 'שלב אחרון', 'סיבת נטישה', 'פנה לנציג', 'קטגוריית פנייה', 'קטגוריית משוב', 'מקור הסיבה']:
        vals = col(t, name)
        out.append(f'- {name}: ' + (known_counts(vals, name) if vals is not None else 'אין עמודה'))
    for name in ['שאלות ללא מענה', 'הודעות לקוח']:
        vals = col(t, name)
        if vals is None:
            out.append(f'- {name}: אין עמודה'); continue
        nums = [v for v in vals if re.fullmatch(r'\d+', v)]
        out.append(f'- {name}: ריקים {sum(1 for v in vals if not v)}; מספרים {len(nums)}; סכום {sum(int(v) for v in nums)}; לא מספר {sum(1 for v in vals if v and not re.fullmatch(r"\d+", v))}')
    dates(t, 'תאריך כניסה')
    dates(t, 'נסרק ב:')
    n = col(t, 'סיבת הסרה') or []
    nn = [v for v in n if v]
    out.append(f'- סיבת הסרה: מלאים {len(nn)}; שונים {len(set(nn))}; אורך מרבי {max((len(v) for v in nn), default=0)}')
    ns = col(t, 'קוד מזהה') or []
    out.append(f'- קוד מזהה: ריקים {sum(1 for v in ns if not v)}; שונים {len(set(v for v in ns if v))}; כפולים {len(ns) - len(set(ns))}; נמצאים בלידים {sum(1 for v in set(ns) if v in leads_ns)}')
    bought, reason = col(t, 'קנה'), col(t, 'סיבת נטישה')
    if bought and reason:
        x = collections.Counter((b, r) for b, r in zip(bought, reason) if r in KNOWN['סיבת נטישה'])
        out.append('- קנה x סיבה: ' + '; '.join(f'{b or "ריק"}/{r} ({c})' for (b, r), c in x.most_common()))
    step = col(t, 'שלב אחרון')
    if bought and step:
        x = collections.Counter((b, 'התחיל שאלון (שלב N)' if STEP_N.match(s) else s) for b, s in zip(bought, step) if s in KNOWN['שלב אחרון'] or STEP_N.match(s))
        out.append('- קנה x שלב: ' + '; '.join(f'{b or "ריק"}/{s} ({c})' for (b, s), c in x.most_common()))

if 'שאלות לסוכן' in tabs:
    t = 'שאלות לסוכן'
    fill(t)
    h, data = tabs[t]
    cat = col(t, 'קטגוריה')
    out.append('- קטגוריה: ' + (known_counts(cat, 'קטגוריה(שאלות)') if cat is not None else 'אין עמודה'))
    st = col(t, 'סטטוס')
    out.append('- סטטוס: ' + (known_counts(st, 'סטטוס') if st is not None else 'אין עמודה'))
    occ = col(t, 'מופעים') or []
    nums = [int(v) for v in occ if re.fullmatch(r'\d+', v)]
    out.append(f'- מופעים: מספרים {len(nums)}; סכום {sum(nums)}; פעמיים ומעלה {sum(1 for v in nums if v >= 2)}; לא מספר {sum(1 for v in occ if v and not re.fullmatch(r"\d+", v))}')
    dates(t, 'נשאל לאחרונה')
    ex = col(t, 'דוגמאות (קוד מזהה)') or []
    out.append(f'- דוגמאות: מלאים {sum(1 for v in ex if v)}; מספר קודים בשורה: ' + ', '.join(f'{k}:{v}' for k, v in sorted(collections.Counter(len([x for x in re.split(r"[,\s]+", v) if x]) for v in ex if v).items())))
    ans = col(t, 'תשובת יקיר') or []
    out.append(f'- תשובת יקיר: מלאים {sum(1 for v in ans if v)}')

if 'פניות' in tabs:
    t = 'פניות'
    fill(t)
    h, data = tabs[t]
    cat = col(t, 'קטגוריה')
    out.append('- קטגוריה: ' + (known_counts(cat, 'קטגוריה(פניות)') if cat is not None else 'אין עמודה'))
    dates(t, h[0])
    ids = col(t, 'מזהה לקוח') or []
    out.append(f'- מזהה לקוח: ריקים {sum(1 for v in ids if not v)}; שונים {len(set(v for v in ids if v))}; נמצאים בלידים {sum(1 for v in set(ids) if v in leads_ns)}')
    if cat is not None:
        a = col(t, h[0])
        late = [(d, k) for d, k in zip(a, cat) if re.match(r'^\d{1,2}/\d{1,2}/\d{4}', d)]
        def key(d):
            dd, mm, yy = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', d).groups()
            return (int(yy), int(mm), int(dd))
        after = [(d, k) for d, k in late if key(d) >= (2026, 10, 2)]
        out.append(f'- מ-2/10: {len(after)} שורות; בלי קטגוריה {sum(1 for d, k in after if not k)}; לפני 2/10: {len(late) - len(after)}; תאריך לא מפוענח {len(a) - len(late)}')

if 'משובים' in tabs:
    t = 'משובים'
    fill(t)
    h, data = tabs[t]
    cat = col(t, 'קטגוריה')
    out.append('- קטגוריה: ' + (known_counts(cat, 'קטגוריה(משובים)') if cat is not None else 'אין עמודה'))
    ex = col(t, 'מבחן')
    out.append('- מבחן: ' + (known_counts(ex, 'מבחן') if ex is not None else 'אין עמודה'))
    dates(t, h[0])
    ids = col(t, 'קוד מזהה') or []
    out.append(f'- קוד מזהה: ריקים {sum(1 for v in ids if not v)}; שונים {len(set(v for v in ids if v))}; נמצאים בלידים {sum(1 for v in set(ids) if v in leads_ns)}')
    if cat is not None:
        a = col(t, h[0])
        def key(d):
            m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', d)
            return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
        ks = [(key(d), k) for d, k in zip(a, cat)]
        after = [(d, k) for d, k in ks if d and d >= (2026, 10, 2)]
        out.append(f'- מ-2/10: {len(after)} שורות; בלי קטגוריה {sum(1 for d, k in after if not k)}; לפני 2/10: {sum(1 for d, k in ks if d and d < (2026, 10, 2))}; תאריך לא מפוענח {sum(1 for d, k in ks if not d)}')

print('\n'.join(out))


# ---------- "הבוט קודם" (3/11): ערכים קטגוריים בלבד ----------
def counts(tab_rows, h, name, min_count, max_len):
    if name not in h:
        return 'אין עמודה'
    i = h.index(name)
    c = collections.Counter((r[i].strip() if i < len(r) else '') for r in tab_rows)
    empty = c.pop('', 0)
    shown = [(k, v) for k, v in c.most_common() if v >= min_count and len(k) <= max_len]
    hidden = sum(c.values()) - sum(v for _, v in shown)
    return f'ריקים {empty}; ' + '; '.join(f'{k} ({v})' for k, v in shown) + (f'; עוד {hidden} שורות בערכים נדירים או ארוכים' if hidden else '')


more = []
rows, err = load('282711056')
if rows:
    h = [c.strip() for c in rows[0]]
    data = [r for r in rows[1:] if any(c.strip() for c in r)]
    more.append('## רכישות')
    more.append('- סיבה: ' + counts(data, h, 'סיבה', 3, 60))
    more.append('- של הבוט: ' + counts(data, h, 'של הבוט', 1, 10))
    if 'תאריך' in h and 'מוצר שנקנה' in h:
        di, pi = h.index('תאריך'), h.index('מוצר שנקנה')
        def ymd(v):
            m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', v)
            return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
        noname = collections.Counter()
        days = collections.Counter()
        for r in data:
            d = ymd(r[di].strip() if di < len(r) else '')
            p = (r[pi].strip() if pi < len(r) else '')
            if d:
                days[d] += 1
            if d and p in ('', '-'):
                noname['לפני 20/10' if d < (2026, 10, 20) else 'מ-20/10'] += 1
        more.append(f'- בלי שם מוצר: {dict(noname)}; לפני 1/9: {sum(v for k, v in days.items() if k < (2026, 9, 1))}')
        import datetime
        if days:
            start = max(datetime.date(2026, 9, 1), datetime.date(*min(days)))
            end = datetime.date(*max(days))
            gaps = []
            d = start
            while d <= end:
                if days[(d.year, d.month, d.day)] == 0:
                    gaps.append(f'{d.day}/{d.month}')
                d += datetime.timedelta(days=1)
            more.append(f'- ימים בלי שורות מ-1/9: {", ".join(gaps) or "אין"}')
if 'לידים' in tabs:
    h, data = tabs['לידים']
    more.append('## לידים')
    more.append('- אופן שיחה: ' + counts(data, h, 'אופן שיחה', 2, 40))
    more.append('- התחיל שיחה: ' + counts(data, h, 'התחיל שיחה', 2, 40))
print('\n'.join(more))
