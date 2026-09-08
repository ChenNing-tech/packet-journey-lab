import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1672, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/');
const scenes = await page.locator('.scenario-button').count();
for (let i = 0; i < scenes; i++) {
  await page.locator('.scenario-button').nth(i).click();
  const layout = await page.locator('.topology-svg').evaluate(svg => {
    const nodes = [...svg.querySelectorAll('.device-node')].map(node => {
      const matrix = node.transform.baseVal.consolidate().matrix;
      return { name: node.querySelector('.device-name').textContent, type: node.querySelector('.equipment').classList[1], x: matrix.e, y: matrix.f };
    });
    const subnetY = [...svg.querySelectorAll('.subnet-badge')].map(node => node.transform.baseVal.consolidate().matrix.f);
    return { nodes, subnetY };
  });
  for (const type of ['equipment-pc', 'equipment-server']) {
    const nodes = layout.nodes.filter(node => node.type === type);
    if (nodes.length > 1) {
      assert.equal(new Set(nodes.map(node => node.x)).size, 1, `${type} should share a vertical column`);
      assert.equal(new Set(nodes.map(node => node.y)).size, nodes.length);
    }
  }
  assert.equal(new Set(layout.subnetY).size, 1, 'Subnet labels should share one baseline');
  assert.equal(await page.locator('.device-selection, .equipment > ellipse').count(), 0);
}

const widths = [2048, 1672, 1440, 1280, 1151, 1024, 768, 390, 320];
for (const width of widths) {
  await page.setViewportSize({ width, height: 1000 });
  const layout = await page.locator('.compact-header').evaluate(header => {
    const buttons = [...header.querySelectorAll('.primary-controls > button')].map(button => {
      const box = button.getBoundingClientRect();
      return { name: button.textContent, left: box.left, right: box.right, top: box.top };
    });
    const context = header.querySelector('.header-context').getBoundingClientRect();
    const controls = header.querySelector('.playback-bar').getBoundingClientRect();
    return { height: header.getBoundingClientRect().height, buttons, contextRight: context.right, controlsLeft: controls.left, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(layout.overflow, false, `${width}px page overflow`);
  assert.deepEqual(layout.buttons.map(button => button.name), ['播放', '上一步', '下一步', '重播本步', '重置']);
  layout.buttons.slice(1).forEach((button, index) => assert.ok(button.left >= layout.buttons[index].right, `${width}px overlapping toolbar buttons`));
  if (width > 1150) {
    assert.equal(layout.height, 68);
    assert.ok(layout.controlsLeft >= layout.contextRight, `${width}px header context overlaps controls`);
  }
}

await page.setViewportSize({ width: 1672, height: 1000 });
await page.getByRole('button', { name: /DNS 域名解析/ }).click();
const eventId = await page.locator('.timeline-event').evaluateAll(buttons => buttons.find(button => button.querySelector('.timeline-path')?.textContent.replace(/\s/g, '') === 'SW1DNS' && button.querySelector('.protocol-badge')?.textContent === 'DNS')?.getAttribute('data-testid'));
assert.ok(eventId, 'DNS forwarding event exists');
await page.getByTestId(eventId).click();
await page.getByRole('button', { name: '0.5 倍速', exact: true }).click();
await page.getByRole('button', { name: '重播当前步骤', exact: true }).click();
const samples = await page.evaluate(() => new Promise(resolve => {
  const link = document.querySelector('[data-testid="link-SW1-DNS"]');
  const points = [...link.points].map(point => ({ x: point.x, y: point.y }));
  const samples = [];
  const sample = () => {
    const packet = document.querySelector('.packet-capsule');
    const { e: x, f: y } = packet.transform.baseVal.consolidate().matrix;
    const distance = Math.min(...points.slice(1).map((b, i) => {
      const a = points[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    }));
    samples.push({ x, y, distance });
    if (samples.length < 60) requestAnimationFrame(sample); else resolve(samples);
  };
  requestAnimationFrame(sample);
}));
assert.ok(samples.every(sample => sample.distance < .01), 'DNS packets must stay on the displayed SW1 connection');
assert.ok(new Set(samples.map(sample => sample.x)).size > 5, 'DNS animation should move');
await page.getByRole('button', { name: '暂停', exact: true }).click();
await page.screenshot({ path: 'artifacts/aligned-dns-path.png', fullPage: true });
await page.getByRole('button', { name: '1 倍速', exact: true }).click();
assert.deepEqual(errors, []);
const result = { result: 'PASS', scenes, viewportWidths: widths, checks: ['vertical PC and server columns', 'aligned subnet baselines', 'no device floor circles', 'compact header order and no overlaps', 'DNS packet follows its original SW1 link'], errors };
await writeFile('artifacts/layout-check.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
