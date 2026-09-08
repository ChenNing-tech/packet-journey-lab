import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1512, height: 1050 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:5173/');
await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
await page.getByTestId('event-5').click();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: 'artifacts/arp-broadcast.png', fullPage: true });
await browser.close();
