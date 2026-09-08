import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1512, height: 1050 } });
const errors = [];
const externalRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url()); });
await page.goto('http://127.0.0.1:4173/');
await page.reload();
const scenes = [];
for (let index = 0; index < 8; index++) {
  await page.locator('.scenario-nav button').nth(index).click();
  await page.getByRole('slider', { name: '拖动时间线' }).focus();
  await page.getByRole('slider', { name: '拖动时间线' }).press('End');
  const status = await page.locator('.scenario-status').textContent();
  if (!status.includes('实验已完成')) throw new Error(`Scenario ${index} did not complete: ${status}`);
  scenes.push({ title: await page.locator('.header-scenario').textContent(), status });
}
await page.locator('.scenario-nav button').first().click();
const report = { build: 'production dist served by vite preview', scenes, errors, externalRequests, result: errors.length || externalRequests.length ? 'FAIL' : 'PASS' };
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/production-check.json', JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (report.result !== 'PASS') process.exitCode = 1;
