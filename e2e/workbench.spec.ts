import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('场景栏：收缩图标、临时展开、固定与刷新记忆', async ({ page }) => {
  const shell = page.locator('.sidebar-shell');
  await expect(shell).toHaveClass(/is-pinned/);
  const original = await page.locator('.main-content').boundingBox();
  await page.getByRole('button', { name: '收起实验场景', exact: true }).click();
  await expect(shell).toHaveClass(/is-collapsed/);
  expect((await page.locator('.main-content').boundingBox())!.width).toBeGreaterThan(original!.width);
  await expect(page.locator('.scenario-nav button')).toHaveCount(8);
  await page.locator('.scenario-nav').getByRole('button', { name: 'ARP 地址解析', exact: true }).click();
  await expect(page.locator('.header-scenario')).toHaveText('ARP 地址解析');
  await expect(shell).toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: '展开实验场景', exact: true }).click();
  await expect(shell).toHaveClass(/is-expanded.*is-unpinned/);
  await page.getByRole('button', { name: '跨网段 Ping', exact: true }).click();
  await expect(shell).toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: '展开实验场景', exact: true }).click();
  await page.getByRole('button', { name: '固定场景栏', exact: true }).click();
  await page.getByRole('button', { name: 'DNS 域名解析', exact: true }).click();
  await expect(shell).toHaveClass(/is-expanded.*is-pinned/);
  await page.reload();
  await expect(shell).toHaveClass(/is-expanded.*is-pinned/);
  await page.getByRole('button', { name: '取消固定场景栏', exact: true }).click();
  await page.locator('.header-scenario').click();
  await expect(shell).toHaveClass(/is-collapsed/);
  await page.reload();
  await expect(shell).toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: '展开故障设置', exact: true }).click();
  await expect(page.locator('#fault-select')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(shell).toHaveClass(/is-collapsed/);
  await expect(page.getByRole('button', { name: '展开实验场景', exact: true })).toBeFocused();
});

test('拓扑内讲解：术语注释、收起、问答重置与关闭恢复', async ({ page }) => {
  await expect(page.locator('.page-heading')).toHaveCount(0);
  const teacher = page.locator('.topology-canvas .teacher-float');
  await expect(teacher).toBeVisible();
  const map = await page.locator('.topology-svg').boundingBox();
  expect((await teacher.boundingBox())!.y).toBeGreaterThanOrEqual(map!.y + map!.height);
  await page.getByRole('button', { name: '查看 离散事件 注释', exact: true }).click();
  await expect(page.locator('.term-annotation')).toBeVisible();
  await expect(page.locator('.term-annotation')).toContainText('发送、收帧、查表');
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(page.locator('.answer')).toBeVisible();
  const expanded = await teacher.boundingBox();
  await page.getByRole('button', { name: '收起课堂讲解', exact: true }).click();
  await expect(page.locator('.teacher-body')).toBeHidden();
  expect((await teacher.boundingBox())!.height).toBeLessThan(expanded!.height);
  await page.getByRole('button', { name: '展开课堂讲解', exact: true }).click();
  await page.getByTestId('event-1').click();
  await expect(page.locator('.teacher-float-header h3')).toContainText('第 2 步');
  await expect(page.locator('.answer')).toHaveCount(0);
  await expect(page.locator('.term-annotation')).toBeHidden();
  await page.getByRole('button', { name: '关闭课堂讲解', exact: true }).click();
  await expect(teacher).toHaveCount(0);
  await page.getByRole('button', { name: '课堂讲解', exact: true }).click();
  await expect(teacher).toBeVisible();
});

test('课堂讲解编辑：暂停播放、按步骤保存、取消与恢复默认', async ({ page }) => {
  const teacher = page.locator('.teacher-float');
  const defaultExplanation = (await teacher.locator('.teacher-explanation').innerText()).trim();

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑课堂讲解', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: '编辑课堂讲解内容' })).toBeVisible();

  await page.getByLabel('讲解正文', { exact: true }).fill('自定义讲解：先判断目的 IP 是否属于本地网段。');
  await page.getByLabel('思考题', { exact: true }).fill('这一步为什么还没有发送 ICMP 报文？');
  await page.getByLabel('参考答案', { exact: true }).fill('因为主机要先确定下一跳，并准备对应的二层目的 MAC。');
  await page.getByLabel('常见误区与补充注释', { exact: true }).fill('不要把目的 IP 和下一跳 MAC 混为一谈。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/teaching-editor.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/teaching-editor-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();

  await expect(teacher.locator('.customized-badge')).toHaveText('已自定义');
  await expect(teacher.locator('.teacher-explanation')).toContainText('自定义讲解');
  await expect(teacher.locator('.thinking-question')).toContainText('为什么还没有发送 ICMP');
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(teacher.locator('.answer')).toContainText('先确定下一跳');
  await teacher.locator('.misconception summary').click();
  await expect(teacher.locator('.misconception')).toContainText('不要把目的 IP');

  await page.reload();
  await expect(teacher.locator('.customized-badge')).toHaveText('已自定义');
  await expect(teacher.locator('.teacher-explanation')).toContainText('自定义讲解');
  await page.getByTestId('event-1').click();
  await expect(teacher.locator('.customized-badge')).toHaveCount(0);
  await expect(teacher.locator('.teacher-explanation')).not.toContainText('自定义讲解');
  await page.getByTestId('event-0').click();
  await expect(teacher.locator('.customized-badge')).toHaveText('已自定义');

  await page.getByRole('button', { name: '编辑课堂讲解', exact: true }).click();
  await page.getByLabel('讲解正文', { exact: true }).fill('这段修改应该被取消');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(teacher.locator('.teacher-explanation')).toContainText('自定义讲解');

  await page.getByRole('button', { name: '编辑课堂讲解', exact: true }).click();
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(page.getByLabel('讲解正文', { exact: true })).toHaveValue(defaultExplanation);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(teacher.locator('.customized-badge')).toHaveCount(0);
  await expect(teacher.locator('.teacher-explanation')).toHaveText(defaultExplanation);
  await page.reload();
  await expect(teacher.locator('.customized-badge')).toHaveCount(0);
  await expect(teacher.locator('.teacher-explanation')).toHaveText(defaultExplanation);
});

test('右侧检查窗口：设备自动切换、地址横向滚动与键盘标签', async ({ page }) => {
  await page.getByRole('button', { name: '跨网段 Ping', exact: true }).click();
  await page.getByTestId('event-33').click();
  await page.getByRole('button', { name: '查看 R1 设备详情', exact: true }).click();
  await expect(page.getByRole('tab', { name: /设备透视/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#packet-view')).toBeHidden();
  await expect(page.locator('#device-view .matched-route')).toContainText('192.168.20.0/24');
  await page.getByRole('button', { name: /地址变化表/ }).click();
  await expect(page.locator('#device-view .address-table tbody tr')).toHaveCount(2);
  expect(await page.locator('#device-view .address-view .table-scroll').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  const currentStep = await page.getByTestId('step-counter').textContent();
  await page.getByRole('tab', { name: /设备透视/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '数据包检查器', exact: true })).toBeFocused();
  await expect(page.locator('#packet-view')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /设备透视/ })).toBeFocused();
  await expect(page.locator('#device-view')).toBeVisible();
  await expect(page.getByTestId('step-counter')).toHaveText(currentStep!);
  await page.keyboard.press('Escape');
  await expect(page.locator('#packet-view')).toBeVisible();
});

test('工作台响应式与实际截图：面板不溢出、讲解不遮挡设备', async ({ page }) => {
  for (const width of [1672, 1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`).toBe(true);
    const area = await page.locator('.topology-canvas').boundingBox();
    const teacher = await page.locator('.teacher-float').boundingBox();
    expect(teacher!.x).toBeGreaterThanOrEqual(area!.x);
    expect(teacher!.x + teacher!.width).toBeLessThanOrEqual(area!.x + area!.width + 1);
  }
  await page.setViewportSize({ width: 1672, height: 1000 });
  await page.getByRole('button', { name: '收起实验场景', exact: true }).click();
  await page.getByRole('button', { name: '跨网段 Ping', exact: true }).click();
  await page.getByTestId('event-33').click();
  await page.getByRole('button', { name: '查看 R1 设备详情', exact: true }).click();
  await page.getByRole('button', { name: '查看 NAT 注释', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/workbench-device-teaching.png', fullPage: true });
  await page.getByRole('tab', { name: '数据包检查器', exact: true }).click();
  await page.screenshot({ path: 'artifacts/workbench-packet-teaching.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/workbench-mobile.png', fullPage: true });
});
