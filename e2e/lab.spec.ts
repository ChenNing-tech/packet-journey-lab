import { expect, test } from '@playwright/test';
import { createScenario, FAULTS, SCENARIOS } from '../src/simulation/scenarios';
import { stateAt } from '../src/simulation/engine';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

for (const meta of SCENARIOS) {
  test(`${meta.title}：逐事件检查界面、协议快照与跳转`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.getByRole('button', { name: new RegExp(meta.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
    const scenario = createScenario(meta.id);
    for (const event of scenario.events) {
      await page.getByTestId(`event-${event.index}`).click();
      await expect(page.getByTestId('step-counter')).toHaveText(`${event.index + 1} / ${scenario.events.length}`);
      await expect(page.locator('.event-focus-title h3')).toHaveText(event.name);
      if (event.packet) {
        await expect(page.locator('.packet-summary strong')).toHaveText(event.packet.label);
        const layerHeaders = await page.locator('.layer-heading strong').allTextContents();
        expect(layerHeaders.includes('Ethernet II')).toBe(Boolean(event.packet.ethernet));
        expect(layerHeaders.includes('IPv4')).toBe(Boolean(event.packet.ipv4));
        expect(layerHeaders.includes('ARP')).toBe(Boolean(event.packet.arp));
      }
      const expectedMacRows = stateAt(scenario, event.index).macTables.SW1?.length ?? 0;
      await expect(page.locator('.device-content tbody tr')).toHaveCount(expectedMacRows);
    }
    await expect(page.locator('.scenario-status')).toContainText('实验已完成');
    await page.getByRole('button', { name: '重置场景', exact: true }).click();
    await expect(page.getByTestId('step-counter')).toHaveText(`1 / ${scenario.events.length}`);
    await expect(page.locator('.device-content tbody tr')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('播放控制：暂停冻结、倍速、回退、重播只播放当前步骤', async ({ page }) => {
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByTestId('step-counter')).not.toHaveText(/^1\s*\//, { timeout: 10_000 });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page.getByTestId('step-counter').textContent();
  const capsules = await page.locator('.packet-capsule').evaluateAll(elements => elements.map(e => e.getAttribute('transform')));
  // Give the browser clock a visible playback interval to prove pause is stable.
  await page.waitForTimeout(2700);
  await expect(page.getByTestId('step-counter')).toHaveText(paused!);
  expect(await page.locator('.packet-capsule').evaluateAll(elements => elements.map(e => e.getAttribute('transform')))).toEqual(capsules);
  await page.getByRole('button', { name: '下一步', exact: false }).click();
  await page.getByRole('button', { name: '上一步', exact: false }).click();
  await expect(page.getByTestId('step-counter')).toHaveText(paused!);
  await page.getByRole('button', { name: '2 倍速', exact: true }).click();
  await expect(page.getByRole('button', { name: '2 倍速', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '重播当前步骤', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('step-counter')).toHaveText(paused!);
  const slider = page.getByRole('slider', { name: '拖动时间线' });
  await slider.focus();
  await slider.press('End');
  await expect(page.locator('.scenario-status')).toContainText('实验已完成');
  await slider.press('Home');
  await expect(page.getByTestId('step-counter')).toHaveText(/^1\s*\//);
  await expect(page.getByRole('button', { name: '上一步', exact: false })).toBeDisabled();
});

test('广播同时扩散、单播动画暂停与重播位置正确', async ({ page }) => {
  const scenario = createScenario('lan-ping');
  const broadcast = scenario.events.find(e => e.type === 'SWITCH_FLOOD_BROADCAST')!;
  await page.getByTestId(`event-${broadcast.index}`).click();
  await expect(page.locator('.packet-capsule')).toHaveCount(broadcast.paths.length);
  expect(broadcast.paths.length).toBeGreaterThan(1);
  const finalPositions = await page.locator('.packet-capsule').evaluateAll(elements => elements.map(e => e.getAttribute('transform')));
  await page.getByRole('button', { name: '重播当前步骤', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(await page.locator('.packet-capsule').evaluateAll(elements => elements.map(e => e.getAttribute('transform')))).not.toEqual(finalPositions);
  await page.getByRole('button', { name: '查看 SW1 设备详情' }).click();
  await expect(page.locator('.device-pills button.active')).toHaveText('SW1');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
});

test('分层检查器、教师答案、地址对比与路由器透视', async ({ page }) => {
  await page.getByRole('button', { name: /跨网段 Ping/ }).click();
  const scenario = createScenario('routed-ping');
  const reframe = scenario.events.find(e => e.type === 'ROUTER_REENCAPSULATE')!;
  await page.getByTestId(`event-${reframe.index}`).click();
  await page.getByRole('button', { name: '查看 R1 设备详情' }).click();
  await expect(page.locator('.matched-route')).toContainText('192.168.20.0/24');
  await expect(page.locator('.router-stages')).toContainText('TTL 64 → 63');
  await page.getByRole('button', { name: /地址变化表/ }).click();
  await expect(page.locator('.address-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.address-table .changed-cell')).toHaveCount(3);
  await page.getByRole('button', { name: '显示答案', exact: false }).click();
  await expect(page.locator('.answer')).toContainText('两个端到端 IP 地址没有变化');
  await page.getByRole('tab', { name: '数据包检查器', exact: true }).click();
  await page.getByRole('button', { name: '隐藏字段', exact: true }).click();
  await expect(page.locator('.packet-fields')).toHaveCount(0);
  await page.getByRole('button', { name: '显示字段', exact: true }).click();
  await expect(page.locator('.packet-fields')).not.toHaveCount(0);
  await page.getByRole('button', { name: '课堂讲解', exact: true }).click();
  await expect(page.locator('.teacher-panel')).toHaveCount(0);
  await page.getByRole('button', { name: '课堂讲解', exact: true }).click();
  await expect(page.locator('.teacher-panel')).toBeVisible();
  await page.getByLabel('地址标签').uncheck();
  await expect(page.locator('.device-address')).toHaveCount(0);
  await page.getByLabel('地址标签').check();
  await expect(page.locator('.device-address')).not.toHaveCount(0);
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
});

for (const fault of FAULTS.filter(f => f.id !== 'none')) {
  test(`故障：${fault.title} 显示具体诊断并禁止继续播放`, async ({ page }) => {
    await page.getByLabel('故障演示').selectOption(fault.id);
    const scenario = createScenario(fault.scenario, fault.id);
    if (fault.id === 'switch-off') {
      await expect(page.getByTestId('link-PC1-SW1')).toHaveAttribute('stroke-dasharray', '5 5');
      await expect(page.getByTestId('link-SW1-R1')).not.toHaveAttribute('stroke-dasharray');
    }
    if (fault.id === 'router-off') {
      await expect(page.getByTestId('link-SW1-R1')).toHaveAttribute('stroke-dasharray', '5 5');
      await expect(page.getByTestId('link-R1-SW2')).not.toHaveAttribute('stroke-dasharray');
    }
    await page.getByTestId(`event-${scenario.events.length - 1}`).click();
    await expect(page.getByRole('alert')).toContainText(scenario.events.at(-1)!.failure!.reason);
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '下一步', exact: false })).toBeDisabled();
    await page.getByRole('button', { name: '清除故障，重新实验' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('step-counter')).toHaveText(/^1\s*\//);
  });
}

test('刷新、帮助弹窗、键盘操作与移动端布局', async ({ page }) => {
  await page.reload();
  await expect(page.getByRole('heading', { name: '数据包传输动画实验室' })).toBeVisible();
  await page.getByRole('button', { name: '使用指南' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('heading', { name: /网络拓扑/ }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('step-counter')).toHaveText(/^2\s*\//);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scenario = createScenario('lan-ping');
  const broadcast = scenario.events.find(e => e.type === 'SWITCH_FLOOD_BROADCAST')!;
  await page.getByTestId(`event-${broadcast.index}`).click();
  const before = await page.locator('.packet-capsule').evaluateAll(elements => elements.map(e => e.getAttribute('transform')));
  await page.getByRole('button', { name: '重播当前步骤', exact: true }).click();
  expect(await page.locator('.packet-capsule').evaluateAll(elements => elements.map(e => e.getAttribute('transform')))).toEqual(before);
});

test('保存桌面完整视图与路由器处理截图', async ({ page }) => {
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
  await page.getByRole('button', { name: /跨网段 Ping/ }).click();
  const event = createScenario('routed-ping').events.find(e => e.type === 'ROUTER_REENCAPSULATE')!;
  await page.getByTestId(`event-${event.index}`).click();
  await page.getByRole('button', { name: '查看 R1 设备详情' }).click();
  await page.getByRole('button', { name: /地址变化表/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/routed-ping.png', fullPage: true });
});
