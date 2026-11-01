// צילומי מסך של הסקשנים בדשבורד החי, לדיווח למנהל. רץ בגיטהאב (workflow "צילומי מסך"), והפלט נשמר מוצפן.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'https://ai.vitrue.co.il/oshermax/';
const OUT = process.argv[3] ?? 'shots';
const SECTIONS = ['bot', 'buys', 'coupons', 'mail', 'popup', 'tracking', 'exams', 'sources'];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, width, scheme] of [['desktop', 1280, 'dark'], ['phone', 375, 'dark'], ['light', 1280, 'light']]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: name === 'phone' ? 2 : 1, colorScheme: scheme });
  // ברירת המחדל כהה. מצב בהיר נבחר בכפתור, והבחירה נשמרת ב-localStorage
  await page.addInitScript((t) => { try { localStorage.setItem('osher-theme', t); } catch {} }, scheme);
  await page.goto(`${URL}?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#bot', { timeout: 30000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    openLists: document.querySelectorAll('.lrow.open').length,
    rows: document.querySelectorAll('.lrow > button').length,
  }));
  console.log(`${name}: ${JSON.stringify(info)}`);
  if (name === 'desktop') await page.screenshot({ path: `${OUT}/${name}-top.png` });
  // שורת הקפיצה דביקה, ומסתירה את ראש הסקשן בצילום של סקשן אחד
  await page.addStyleTag({ content: '.jump { position: static !important; }' });
  for (const id of name === 'desktop' ? SECTIONS : ['bot']) {
    const section = page.locator(`#${id}`);
    if (!(await section.count())) continue;
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await section.screenshot({ path: `${OUT}/${name}-${id}.png` });
  }
  await page.close();
}
await browser.close();
