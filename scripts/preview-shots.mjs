// צילומי התצוגה המקדימה (#34). רץ בגיטהאב (workflow "תצוגה מקדימה") על האתר המקומי של scripts/preview.mjs, ורק על נתוני ההדגמה.
// נכשל כשהדף לא נטען, כשיש שגיאת JavaScript או כשיש גלישה לצדדים באחד הרוחבים.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173/oshermax/';
const OUT = process.argv[3] ?? 'preview-shots';

// שני שומרים: צילומים של נתונים אמיתיים אסורים, והריפו ציבורי
if (!/^http:\/\/localhost[:/]/.test(BASE)) throw new Error(`מצלמים רק אתר מקומי, לא ${BASE}`);
const { origin } = JSON.parse(await readFile('out/data/leads.json', 'utf8'));
if (origin !== 'demo') throw new Error(`מצלמים רק נתוני הדגמה, והקובץ הוא ${origin}`);

const SIZES = [
  { name: 'desktop', width: 1280, height: 900, scale: 1, touch: false },
  { name: 'tablet', width: 768, height: 1024, scale: 1, touch: true },
  { name: 'phone', width: 390, height: 844, scale: 2, touch: true },
  { name: 'small', width: 360, height: 740, scale: 2, touch: true },
];
const TABS = [{ name: 'bot', label: 'הבוט' }, { name: 'team', label: 'לצוות' }];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const rows = [];
let failed = false;

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** פותח את הדרופ-דאונים שסגורים כרגע, פעם אחת: רשימות שבתוכם נשארות סגורות */
async function openFolds(page) {
  await page.evaluate(() => document.querySelectorAll('button[aria-expanded="false"]').forEach((b) => b.click()));
  await page.waitForTimeout(300);
}

async function shoot(size, theme, tabs) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    isMobile: size.touch,
    hasTouch: size.touch,
    colorScheme: theme,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((t) => { try { localStorage.setItem('osher-theme', t); } catch {} }, theme);
  for (const tab of tabs) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#bot', { timeout: 30000 });
    await page.getByRole('tab', { name: tab.label }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const prefix = `${OUT}/${size.name}-${theme}-${tab.name}`;
    await page.screenshot({ path: `${prefix}-closed.png`, fullPage: true });
    const closed = await overflow(page);
    await openFolds(page);
    await page.screenshot({ path: `${prefix}-open.png`, fullPage: true });
    const open = await overflow(page);
    rows.push({ size: `${size.name} ${size.width}`, theme, tab: tab.name, closed, open });
    if (closed > 0 || open > 0) {
      failed = true;
      console.log(`::error title=גלישה לצדדים::${size.name} ${size.width} ${theme} ${tab.name}: סגור ${closed}, פתוח ${open}`);
    }
  }
  for (const message of errors) {
    failed = true;
    console.log(`::error title=שגיאה בדף::${size.name} ${theme}: ${message}`);
  }
  await context.close();
}

for (const size of SIZES) await shoot(size, 'dark', TABS);
// מצב בהיר: מחשב וטלפון, רק הלשונית הראשית
for (const size of SIZES.filter((s) => s.name === 'desktop' || s.name === 'phone')) await shoot(size, 'light', TABS.slice(0, 1));
await browser.close();

const table = ['| גודל | מצב | לשונית | גלישה, סגור | גלישה, פתוח |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.size} | ${r.theme} | ${r.tab} | ${r.closed} | ${r.open} |`)].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## תצוגה מקדימה, נתוני הדגמה\n\n${table}\n`);
if (failed) process.exitCode = 1;
