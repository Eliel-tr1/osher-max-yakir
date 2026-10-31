// צילומי מסך של הסקשנים בדשבורד החי, לדיווח למנהל. רץ בגיטהאב (workflow "צילומי מסך"), והפלט נשמר מוצפן.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'https://ai.vitrue.co.il/oshermax/';
const OUT = process.argv[3] ?? 'shots';
const SECTIONS = ['buys-h', 'coupons-h', 'mail-h', 'popup-h', 'tracking-h'];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, width] of [['desktop', 1280], ['phone', 390]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: name === 'phone' ? 2 : 1 });
  await page.goto(`${URL}?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#buys-h', { timeout: 30000 });
  await page.waitForTimeout(800);
  if (name === 'desktop') await page.screenshot({ path: `${OUT}/${name}-top.png` });
  for (const id of SECTIONS) {
    const h = page.locator(`#${id}`);
    if (!(await h.count())) continue;
    const section = h.locator('xpath=ancestor::section[1]');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await section.screenshot({ path: `${OUT}/${name}-${id.replace('-h', '')}.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${name}: overflow ${overflow}`);
  await page.close();
}
await browser.close();
