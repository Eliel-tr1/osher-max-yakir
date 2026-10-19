"""מחקר לסוכן ניתוח השיחות (#20). קריאה בלבד, בלי מפתחות ובלי פרטים אישיים.

  python3 scripts/agent-probe.py api BASE             מה ה-API של הבוט מציע: נקודות קצה, שיחות, מגבלת קריאות
  python3 scripts/agent-probe.py sheet ID TAB         מבנה הטבלה: עמודות לפי אות, ותבנית מוסתרת של הקישור לשיחה
  ... | python3 scripts/agent-probe.py notice TITLE   מדפיס את הקלט כהערות על הריצה, בחלקים של עד 2500 בתים

הפלט נכתב להערות של הריצה, והריפו עשוי להיות ציבורי: לא מדפיסים ערכים של לידים, רק ספירות ותבניות
שבהן כל ספרה הוחלפה ב-9.
"""
import collections, csv, io, json, re, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta

HEADERS = {'User-Agent': 'Mozilla/5.0 (osher-max-dashboard probe)', 'Accept': '*/*'}


def fetch(url, timeout=30):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=timeout) as r:
            return r.status, r.geturl(), r.headers.get('content-type', ''), r.read()
    except urllib.error.HTTPError as e:
        return e.code, url, (e.headers.get('content-type', '') if e.headers else ''), b''
    except Exception as e:  # noqa: BLE001 - כל כישלון רשת מדווח כטקסט
        return None, url, '', str(e).encode()


def notices(title, text, limit=2500):
    parts, cur = [], ''
    for line in text.splitlines():
        line = line[:600]
        if len((cur + line).encode()) > limit and cur:
            parts.append(cur)
            cur = ''
        cur += line + '\n'
    parts.append(cur)
    for i, p in enumerate(parts[:10], 1):  # גיטהאב מציג עד 10 הערות לשלב
        p = p.replace('%', '%25').replace('\r', '').replace('\n', '%0A')
        print(f'::notice title={title} {i}/{min(len(parts), 10)}::{p}')


# ---------- api ----------
SPEC_GUESSES = ['/api/docs.json', '/api/swagger.json', '/api/openapi.json', '/api-docs.json', '/docs/api-docs.json',
                '/storage/api-docs/api-docs.json', '/swagger.json', '/openapi.json', '/api/doc.json',
                '/swagger/v1/swagger.json', '/api/documentation', '/api-docs', '/v2/api-docs', '/v3/api-docs',
                '/api/swagger.yaml', '/api/openapi.yaml', '/api.json']
INTERESTING = re.compile(r'chat|message|conversation|history|inbox|live|subscribers|transcript|ai[-_ ]?agent|log', re.I)


def load_spec(raw):
    text = raw.decode('utf-8', 'replace').strip()
    try:
        spec = json.loads(text)
    except ValueError:
        try:
            import yaml  # type: ignore
            spec = yaml.safe_load(text)
        except Exception:  # noqa: BLE001
            return None
    return spec if isinstance(spec, dict) and 'paths' in spec else None


def find_spec(base, out):
    st, final, ctype, body = fetch(base)
    out.append(f'דף: {st} {final} {ctype} {len(body)} בתים')
    html = body.decode('utf-8', 'replace')
    cands = []
    for m in re.finditer(r'''(?:\burl|configUrl|specUrl|spec-url)\s*[:=]\s*["'`]([^"'`\s]+)["'`]''', html):
        cands.append(m.group(1))
    for m in re.finditer(r'''["']([^"'\s]+?(?:swagger|api-docs|openapi)[^"'\s]*?\.(?:json|ya?ml))["']''', html):
        cands.append(m.group(1))
    scripts = re.findall(r'''<script[^>]+src=["']([^"']+)["']''', html)
    out.append('סקריפטים: ' + ' | '.join(scripts[:12]))
    for s in scripts:
        if re.search(r'initializer|swagger-config|config\.js|app\.js', s):
            _, _, _, js = fetch(urllib.parse.urljoin(final, s))
            for m in re.finditer(r'''\burl\s*:\s*["'`]([^"'`\s]+)["'`]''', js.decode('utf-8', 'replace')):
                cands.append(m.group(1))
    if not cands:
        inline = re.findall(r'<script[^>]*>(.*?)</script>', html, re.S)
        for s in inline:
            if 'url' in s.lower():
                out.append('סקריפט פנימי: ' + re.sub(r'\s+', ' ', s)[:300])
    origin = re.match(r'^https?://[^/]+', final).group(0)
    tried = []
    for c in list(dict.fromkeys(cands)) + [origin + g for g in SPEC_GUESSES]:
        if c.startswith('#') or 'petstore' in c:
            continue
        u = urllib.parse.urljoin(final, c)
        if u in tried:
            continue
        tried.append(u)
        s2, f2, t2, b2 = fetch(u)
        spec = load_spec(b2) if s2 == 200 else None
        out.append(f'  ניסיון: {u} -> {s2} {t2[:30]} {"מפרט!" if spec else ""}')
        if spec:
            return u, spec
    return None, None


def describe_schema(schema, spec, depth=0):
    if not isinstance(schema, dict) or depth > 2:
        return ''
    if '$ref' in schema:
        ref = schema['$ref'].split('/')
        node = spec
        for k in ref[1:]:
            node = node.get(k, {}) if isinstance(node, dict) else {}
        return describe_schema(node, spec, depth)
    if schema.get('type') == 'array' or 'items' in schema:
        return '[' + describe_schema(schema.get('items', {}), spec, depth + 1) + ']'
    props = schema.get('properties')
    if isinstance(props, dict):
        return '{' + ', '.join(f'{k}{":" + describe_schema(v, spec, depth + 1) if depth < 2 and isinstance(v, dict) and (v.get("properties") or v.get("items") or v.get("$ref")) else ""}' for k, v in list(props.items())[:25]) + '}'
    return schema.get('type', '')


def api(base):
    out = [f'== {base}']
    url, spec = find_spec(base, out)
    if not spec:
        out.append('לא נמצא מפרט API')
        print('\n'.join(out))
        notices('API ' + base, '\n'.join(out))
        return
    info = spec.get('info', {})
    out.append(f'מפרט: {url}')
    out.append(f'כותרת: {info.get("title")} גרסה {info.get("version")}')
    servers = spec.get('servers') or [{'url': (spec.get('schemes') or ['https'])[0] + '://' + spec.get('host', '?') + spec.get('basePath', '')}]
    out.append('שרתים: ' + ', '.join(s.get('url', '') for s in servers))
    sec = (spec.get('components', {}) or {}).get('securitySchemes') or spec.get('securityDefinitions') or {}
    out.append('אימות: ' + ', '.join(f'{k}={v.get("type")}/{v.get("scheme", v.get("in", ""))}' for k, v in sec.items()))
    desc = (info.get('description') or '')
    if desc:
        out.append('תיאור: ' + re.sub(r'\s+', ' ', desc)[:500])
    ops = []
    for path, item in spec['paths'].items():
        for method, op in item.items():
            if method.lower() in ('get', 'post', 'put', 'patch', 'delete') and isinstance(op, dict):
                ops.append((method.upper(), path, op))
    out.append(f'נקודות קצה: {len(ops)}')
    out.append('-- כולן --')
    for m, p, op in ops:
        tag = (op.get('tags') or [''])[0]
        out.append(f'{m} {p} [{tag}] {(op.get("summary") or op.get("operationId") or "")[:60]}')
    out.append('-- רלוונטיות לשיחות ולרשימת מנויים, בפירוט --')
    for m, p, op in ops:
        blob = ' '.join([p, op.get('summary') or '', op.get('description') or '', ' '.join(op.get('tags') or [])])
        if not INTERESTING.search(blob):
            continue
        params = []
        for prm in op.get('parameters', []) or []:
            if '$ref' in prm:
                prm = describe_ref(prm['$ref'], spec)
            params.append(f'{prm.get("name")}({prm.get("in")}{",חובה" if prm.get("required") else ""}){":" + re.sub(r"\s+", " ", prm.get("description") or "")[:60] if prm.get("description") else ""}')
        body = op.get('requestBody', {}).get('content', {}) if isinstance(op.get('requestBody'), dict) else {}
        body_s = ''.join(describe_schema(v.get('schema', {}), spec) for v in body.values())[:300]
        resp = (op.get('responses') or {}).get('200') or (op.get('responses') or {}).get('201') or {}
        resp_s = ''
        if isinstance(resp, dict):
            content = resp.get('content') or {}
            resp_s = ''.join(describe_schema(v.get('schema', {}), spec) for v in content.values()) or describe_schema(resp.get('schema', {}), spec)
        out.append(f'* {m} {p}: {re.sub(r"\s+", " ", (op.get("description") or op.get("summary") or ""))[:200]}')
        if params:
            out.append('  פרמטרים: ' + '; '.join(params)[:500])
        if body_s:
            out.append('  גוף: ' + body_s)
        if resp_s:
            out.append('  תשובה: ' + resp_s[:400])
    text = json.dumps(spec, ensure_ascii=False)
    hits = [text[max(0, m.start() - 120):m.end() + 120] for m in re.finditer(r'rate.?limit|429|too many requests|per (minute|second)|throttl', text, re.I)]
    out.append('-- מגבלת קריאות במפרט --')
    out.extend(re.sub(r'\s+', ' ', h) for h in hits[:6]) if hits else out.append('לא מוזכרת')
    print('\n'.join(out))
    notices('API ' + base, '\n'.join(out))


def describe_ref(ref, spec):
    node = spec
    for k in ref.split('/')[1:]:
        node = node.get(k, {}) if isinstance(node, dict) else {}
    return node if isinstance(node, dict) else {}


# ---------- sheet ----------
def letters(i):
    s, i = '', i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def mask(v):
    m = re.match(r'^(https?://[^/?#]+)(.*)$', v)
    host, rest = (m.group(1), m.group(2)) if m else ('', v)
    rest = re.sub(r'\d', '9', rest)
    rest = re.sub(r'[A-Za-z0-9_\-]{17,}', lambda t: re.sub(r'[A-Za-z]', 'a', t.group(0)), rest)
    return host + rest


def parse_date(d):
    for f in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y'):
        try:
            return datetime.strptime(d.strip(), f)
        except ValueError:
            pass
    return None


def sheet(sheet_id, tab):
    url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(tab)}'
    text = urllib.request.urlopen(url, timeout=60).read().decode('utf-8-sig')
    rows = list(csv.reader(io.StringIO(text)))
    h = rows[0]
    data = [r for r in rows[1:] if any(c.strip() for c in r)]

    def col(name):
        i = h.index(name)
        return [(r[i].strip() if i < len(r) else '') for r in data]

    out = [f'שורות: {len(data)}, עמודות: {len(h)}', 'עמודות: ' + ', '.join(f'{letters(i)}:{c}' for i, c in enumerate(h))]
    for i, name in enumerate(h):
        if re.search(r'לינק|קישור|מזהה|user|_ns|\bns\b|id$', name, re.I):
            vals = [v for v in col(name) if v]
            pats = collections.Counter(mask(v) for v in vals)
            out.append(f'{letters(i)} {name}: מלאים {len(vals)}, ייחודיים {len(set(vals))}; תבניות: ' + ' | '.join(f'{k} ({n})' for k, n in pats.most_common(5)))
    ans_name = next((c for c in h if c.startswith('ענה לצ')), None)
    if ans_name:
        ans = col(ans_name)
        out.append(f'{ans_name}: ' + '; '.join(f'{k or "ריק"} ({n})' for k, n in collections.Counter(ans).most_common(6)))
        idx = [i for i, a in enumerate(ans) if a]
        link = col('לינק לשיחה') if 'לינק לשיחה' in h else [''] * len(data)
        phone = col('טלפון') if 'טלפון' in h else [''] * len(data)
        out.append(f'שורות שענו: {len(idx)}; עם לינק לשיחה: {sum(1 for i in idx if link[i])}; לינקים שונים: {len({link[i] for i in idx if link[i]})}; טלפונים שונים: {len({re.sub(r"[^0-9]", "", phone[i])[-9:] for i in idx if phone[i]})}')
        dates = [parse_date(d) for d in col('תאריך כניסה')]
        last = max(d for d in dates if d)
        per_day = collections.Counter(dates[i].strftime('%d/%m') for i in idx if dates[i] and dates[i] > last - timedelta(days=14))
        all_day = collections.Counter(d.strftime('%d/%m') for d in dates if d and d > last - timedelta(days=14))
        out.append('ענו לפי יום, 14 הימים האחרונים (ענו/כל השורות): ' + ', '.join(f'{k}: {per_day.get(k, 0)}/{all_day[k]}' for k in sorted(all_day, key=lambda s: (s[3:], s[:2]))))
    for name in ('התחיל שיחה', 'אופן שיחה', 'נימוק', 'נקרא ב'):
        if name in h:
            vals = collections.Counter(v for v in col(name) if v)
            out.append(f'{letters(h.index(name))} {name}: מלאים {sum(vals.values())}; ' + '; '.join(f'{k[:20]} ({n})' for k, n in vals.most_common(6)))
        else:
            out.append(f'{name}: אין עמודה כזאת')
    print('\n'.join(out))
    notices('מבנה טבלה', '\n'.join(out))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'api':
        api(sys.argv[2])
    elif cmd == 'sheet':
        sheet(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'לידים')
    elif cmd == 'notice':
        notices(sys.argv[2], sys.stdin.read())
    else:
        sys.exit(f'פקודה לא מוכרת: {cmd}')
