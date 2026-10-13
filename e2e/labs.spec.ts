import { expect, test, type Download, type Page } from '@playwright/test';
import type { ExperimentRecord } from '../src/labs/teachingTasks';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

async function readExperimentDownload(download: Download): Promise<ExperimentRecord> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('实验记录下载没有可读取内容');
  let content = '';
  for await (const chunk of stream) content += chunk.toString();
  return JSON.parse(content);
}

async function advanceUntilTaskComplete(page: Page, maximum = 140) {
  const panel = page.getByRole('region', { name: '教学任务' });
  for (let index = 0; index < maximum; index += 1) {
    if ((await panel.getByRole('status').textContent())?.includes('任务完成')) return;
    const next = page.getByRole('button', { name: '下一步' });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(panel.getByRole('status')).toContainText('任务完成');
}

test('全局导航可进入两个新增实验室并支持浏览器前进后退', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: '虚拟实验室导航' });
  await expect(navigation.getByRole('tab')).toHaveCount(3);
  await navigation.getByRole('tab', { name: '数字信号编码实验室' }).click();
  await expect(page).toHaveURL(/#\/signal-encoding$/);
  await expect(page.getByRole('heading', { name: '数字信号编码实验室' })).toBeVisible();
  await expect(navigation.getByRole('tab', { name: '数字信号编码实验室' })).toHaveAttribute('aria-selected', 'true');

  await navigation.getByRole('tab', { name: '数据交换技术实验室' }).click();
  await expect(page.getByRole('heading', { name: '数据交换技术实验室' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '数字信号编码实验室' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '数据包传输动画实验室' })).toBeVisible();
});

test('数字信号编码实验室按真实算法绘制波形并支持连续播放与双编码对比', async ({ page }) => {
  await page.goto('/#/signal-encoding');
  await expect(page.getByRole('complementary', { name: '参数设置与实验模式' })).toBeVisible();
  await expect(page.getByRole('region', { name: '数字信号编码实验室可视化实验画布' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '知识解释与当前状态' })).toBeVisible();
  await page.getByLabel('二进制序列').fill('10a1');
  await expect(page.getByLabel('二进制序列')).toHaveValue('101');
  await page.getByLabel('二进制序列').fill('10110');
  await expect(page.getByTestId('waveform-nrz')).toHaveAttribute('data-levels', 'high,low,high,high,low');

  await page.getByRole('button', { name: '选择第 4 个比特' }).click();
  await expect(page.getByRole('button', { name: '选择第 4 个比特' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.state-list>div').filter({ hasText: '当前比特' })).toContainText('1');
  await page.getByText('Manchester', { exact: true }).click();
  await expect(page.getByTestId('waveform-manchester')).toHaveAttribute('data-levels', 'low-high,high-low,low-high,low-high,high-low');
  await expect(page.getByTestId('waveform-manchester')).toHaveAttribute('data-middle-transitions', '5');

  const cursor = page.locator('.signal-cursor').first();
  const cursorBefore = await cursor.getAttribute('x1');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(await cursor.getAttribute('x1')).not.toBe(cursorBefore);
  const pausedCursor = await cursor.getAttribute('x1');
  await page.waitForTimeout(250);
  expect(await cursor.getAttribute('x1')).toBe(pausedCursor);

  await page.getByRole('checkbox', { name: /双编码对比/ }).check();
  await expect(page.getByTestId('waveform-nrz')).toBeVisible();
  await expect(page.getByTestId('waveform-manchester')).toBeVisible();
  await page.getByRole('button', { name: '2×' }).click();
  await expect(page.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('二进制序列').fill('000000');
  await expect(page.getByRole('button', { name: '选择第 1 个比特' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'artifacts/signal-encoding-lab.png', fullPage: true });

  await page.getByRole('checkbox', { name: /双编码对比/ }).uncheck();
  await page.getByLabel('二进制序列').fill('1');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 2500 });
  const finishedX = Number(await page.locator('.signal-cursor').getAttribute('x1'));
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(Number(await page.locator('.signal-cursor').getAttribute('x1'))).toBeLessThan(finishedX);
});

test('波形解码挑战隐藏原始比特并支持逐位判定、重试和重新出题', async ({ page }) => {
  await page.goto('/#/signal-encoding');
  await page.getByRole('tab', { name: '波形解码', exact: true }).click();
  await expect(page.getByText('原始比特已隐藏', { exact: true })).toBeVisible();
  await expect(page.locator('.interactive-bit-strip button')).toHaveCount(5);
  await expect(page.locator('.interactive-bit-strip button').first()).toContainText('?');

  await page.getByLabel('解码答案').fill('10110');
  await page.getByRole('button', { name: '检查答案' }).click();
  await expect(page.locator('.challenge-summary[role="status"]')).toContainText('全部正确');
  await expect(page.locator('.interactive-bit-strip button.correct')).toHaveCount(5);
  await page.getByRole('button', { name: '再次尝试' }).click();
  await expect(page.getByLabel('解码答案')).toHaveValue('');

  await page.getByLabel('解码答案').fill('00000');
  await page.getByRole('button', { name: '检查答案' }).click();
  await expect(page.locator('.challenge-summary[role="status"]')).toContainText('还有比特需要修正');
  await expect(page.locator('.interactive-bit-strip button.incorrect')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/signal-encoding-challenge.png', fullPage: true });
  await page.getByRole('button', { name: '重新出题' }).click();
  await expect(page.getByLabel('解码答案')).toBeEnabled();
  const nextLength = await page.locator('.interactive-bit-strip button').count();
  expect(nextLength).toBeGreaterThanOrEqual(5);
  expect(nextLength).toBeLessThanOrEqual(8);
});

test('数据交换实验室以同一拓扑完成三种交换流程并显示分组乱序重组', async ({ page }) => {
  await page.goto('/#/data-switching');
  const technologyModes = page.getByRole('region', { name: '实验模式切换' });
  await expect(page.locator('.equipment-pc')).toHaveCount(1);
  await expect(page.locator('.equipment-router')).toHaveCount(4);
  await expect(page.locator('.equipment-server')).toHaveCount(1);
  await expect(technologyModes.getByRole('tab', { name: /分组交换/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByTestId('unit-P1')).toBeVisible();
  await page.getByLabel('实验时间进度').press('End');
  await expect(page.getByTestId('result-status')).toContainText('仿真完成');
  await expect(page.getByTestId('arrival-order')).not.toHaveText('P1 → P2 → P3');
  await expect(page.getByText('分组乱序到达，接收端已按编号恢复。')).toBeVisible();

  await technologyModes.getByRole('tab', { name: /报文交换/ }).click();
  await expect(page.getByLabel('分组大小')).toBeDisabled();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByTestId('unit-M1')).toBeVisible();
  await page.getByLabel('实验时间进度').press('End');
  await expect(page.getByTestId('result-status')).toContainText('仿真完成');

  await technologyModes.getByRole('tab', { name: /电路交换/ }).click();
  await expect(page.getByText('空闲', { exact: true }).last()).toBeVisible();
  await expect(page.getByTestId('unit-DATA')).toHaveCount(0);
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('正在建立', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.sim-link.reserved')).toHaveCount(1);
  await page.getByLabel('实验时间进度').press('End');
  await expect(page.getByText('已释放', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/data-switching-lab.png', fullPage: true });
});

test('数据交换链路故障会生成真实改道路由并支持恢复与确定性重播', async ({ page }) => {
  await page.goto('/#/data-switching');
  await page.getByTestId('link-R1-R3').click();
  await page.getByRole('button', { name: '故障' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByTestId('link-R1-R3')).toHaveClass(/status-failed/);
  await page.getByLabel('实验时间进度').press('End');
  await expect(page.getByTestId('result-status')).toContainText('仿真完成');

  await page.getByRole('button', { name: '重置实验' }).click();
  await expect(page.getByText('开始实验', { exact: true }).first()).toBeVisible();
  await page.getByTestId('link-R1-R3').click();
  await page.getByRole('button', { name: '恢复' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByTestId('link-R1-R3')).toHaveClass(/status-normal/);
});

test('编码教学任务依据逐位观察和真实解码判定，并可导出和重置记录', async ({ page }) => {
  await page.goto('/#/signal-encoding');
  const panel = page.getByRole('region', { name: '教学任务' });
  await page.getByRole('tab', { name: /自由探索/ }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '下一步' }).click();
  await expect(panel.getByRole('status')).toContainText('任务完成');

  await panel.getByRole('tab', { name: '任务 2：比较连续 1' }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  await page.getByLabel('实验时间进度').press('End');
  await expect(panel.getByRole('status')).toContainText('进行中');
  await expect(panel.getByRole('status')).not.toContainText('任务完成');
  for (let index = 1; index <= 6; index += 1) await page.getByRole('button', { name: '选择第 ' + index + ' 个比特' }).click();
  await expect(panel.getByRole('status')).toContainText('任务完成');

  await panel.getByRole('tab', { name: '任务 3：波形解码' }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  const levels = (await page.getByTestId('waveform-manchester').getAttribute('data-levels'))!.split(',');
  const answer = levels.map(level => level === 'low-high' ? '1' : '0').join('');
  await page.getByLabel('解码答案').fill(answer);
  await page.getByRole('button', { name: '检查答案' }).click();
  await expect(panel.getByRole('status')).toContainText('任务完成');

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出实验记录' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^signal-encoding-record-.*\.json$/);
  const record = await readExperimentDownload(download);
  expect(record.tasks.filter(task => task.status === 'completed')).toHaveLength(3);
  expect(record.actions.some(action => action.type === '下一步')).toBe(true);
  expect(record.actions.some(action => action.type === '完成任务' && action.configuration)).toBe(true);
  expect(record.observations.some(observation => observation.includes('解码提交'))).toBe(true);
  expect(record.privacy).toContain('不会上传');
  await panel.getByRole('button', { name: '重新实验' }).click();
  await expect(panel.locator('header b')).toHaveText('0/3');
});

test('交换教学任务读取真实事件证据，链路任务和记录导出均可用', async ({ page }) => {
  await page.goto('/#/data-switching');
  const panel = page.getByRole('region', { name: '教学任务' });
  await page.getByRole('tab', { name: /自由探索/ }).click();

  await panel.getByRole('button', { name: '加载任务参数' }).click();
  await advanceUntilTaskComplete(page);
  await expect(panel.getByRole('status')).toContainText('任务完成');

  await panel.getByRole('tab', { name: '任务 2：报文交换' }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  await advanceUntilTaskComplete(page);

  await panel.getByRole('tab', { name: '任务 3：四分组传输' }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  await expect(page.getByLabel('分组大小')).toHaveValue('300');
  await advanceUntilTaskComplete(page);

  await panel.getByRole('tab', { name: '任务 4：链路变化' }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  await page.getByTestId('link-R1-R3').click();
  await page.getByRole('button', { name: '拥塞' }).click();
  await advanceUntilTaskComplete(page);

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出实验记录' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^data-switching-record-.*\.json$/);
  const record = await readExperimentDownload(download);
  expect(record.tasks.filter(task => task.status === 'completed')).toHaveLength(4);
  expect(record.actions.some(action => action.type === '修改链路状态')).toBe(true);
  expect(record.observations.some(observation => observation.includes('拥塞'))).toBe(true);
  await panel.getByRole('button', { name: '重新实验' }).click();
  await expect(panel.locator('header b')).toHaveText('0/4');
});

test('编码演示保留关键位暂停，交换演示连续播放至完成并允许手动暂停', async ({ page }) => {
  await page.goto('/#/signal-encoding');
  let panel = page.getByRole('region', { name: '教学任务' });
  await panel.getByRole('button', { name: '开始引导演示' }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 5000 });
  await expect(panel.getByRole('status')).toContainText('已暂停');

  await page.goto('/#/data-switching');
  panel = page.getByRole('region', { name: '教学任务' });
  await page.getByRole('button', { name: '2×' }).click();
  await panel.getByRole('button', { name: '开始引导演示' }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await expect(page.locator('.current-switch-event h3')).toHaveText('端到端连接已建立', { timeout: 7000 });
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pausedStep = await page.getByLabel('实验时间进度').inputValue();
  await page.waitForTimeout(250);
  expect(await page.getByLabel('实验时间进度').inputValue()).toBe(pausedStep);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByTestId('result-status')).toContainText('仿真完成', { timeout: 20000 });
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 2500 });
  await expect(panel.getByRole('status')).toContainText('任务完成');
  await expect(page.getByText('已释放', { exact: true })).toBeVisible();
});

test('自由探索支持多位播放结束、重播、键盘控制和本地记录', async ({ page }) => {
  await page.goto('/#/signal-encoding');
  await page.getByRole('button', { name: '实验使用指南' }).click();
  await expect(page.locator('.concept-toolbar-help')).toContainText('输入二进制数据');
  await page.getByRole('button', { name: '实验使用指南' }).click();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await page.getByRole('tab', { name: /自由探索/ }).click();
  await page.getByLabel('二进制序列').fill('101');
  await page.getByRole('button', { name: '2×' }).click();
  const workspace = page.getByLabel('数字信号编码实验室工作区', { exact: true });
  await workspace.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: '选择第 2 个比特' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible({ timeout: 5000 });
  const end = await page.locator('.signal-cursor').getAttribute('x1');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(Number(await page.locator('.signal-cursor').getAttribute('x1'))).toBeLessThan(Number(end));

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出实验记录' }).click();
  const record = await readExperimentDownload(await downloadPromise);
  expect(record.configuration.bits).toBe('101');
  for (const action of ['播放', '暂停', '上一步', '下一步', '修改播放倍率']) {
    expect(record.actions.some(item => item.type === action)).toBe(true);
  }
  expect(record.observations.length).toBeGreaterThan(0);
});

test('交换任务不会混用不同配置的观察证据，触摸操作可选择波形与链路', async ({ page, browser }) => {
  await page.goto('/#/data-switching');
  const panel = page.getByRole('region', { name: '教学任务' });
  await page.getByRole('tab', { name: /自由探索/ }).click();
  await panel.getByRole('button', { name: '加载任务参数' }).click();
  for (let index = 0; index < 20; index += 1) {
    if ((await page.locator('.current-switch-event h3').textContent())?.includes('端到端连接已建立')) break;
    await page.getByRole('button', { name: '下一步' }).click();
  }
  await expect(panel.getByRole('status')).toContainText('已观察 1/3');
  await page.getByLabel('链路速率').selectOption('2');
  await page.getByLabel('实验时间进度').press('End');
  await expect(panel.getByRole('status')).not.toContainText('任务完成');

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const touchPage = await touchContext.newPage();
  try {
    await touchPage.goto(new URL('/#/signal-encoding', page.url()).href);
    await touchPage.getByRole('button', { name: '选择第 2 个比特' }).tap();
    await expect(touchPage.getByRole('button', { name: '选择第 2 个比特' })).toHaveAttribute('aria-pressed', 'true');
    await touchPage.goto(new URL('/#/data-switching', page.url()).href);
    await touchPage.getByTestId('link-R1-R3').tap();
    await touchPage.getByRole('button', { name: '拥塞' }).tap();
    await touchPage.getByRole('button', { name: '下一步' }).tap();
    await expect(touchPage.getByTestId('link-R1-R3')).toHaveClass(/status-congested/);
    expect(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await touchContext.close();
  }
});

test('新增实验室在桌面与移动端均不产生整页横向溢出', async ({ page }) => {
  for (const route of ['signal-encoding', 'data-switching']) {
    for (const width of [1512, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/#/${route}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBe(true);
      await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
      const toolbar = await page.getByRole('region', { name: '实验播放控制' }).boundingBox();
      const workspace = await page.locator('.concept-workspace').boundingBox();
      expect(toolbar!.y + toolbar!.height, '播放工具栏位于实验区域上方').toBeLessThanOrEqual(workspace!.y);
      if (width >= 1280) {
        const title = await page.getByRole('heading', { name: route === 'signal-encoding' ? '数字信号编码实验室' : '数据交换技术实验室', exact: true }).boundingBox();
        expect(title!.y, '标题与播放控制在同一行').toBeLessThan(toolbar!.y + toolbar!.height);
        expect(title!.y + title!.height).toBeGreaterThan(toolbar!.y);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/#/signal-encoding');
  await page.getByLabel('二进制序列').fill('10101010101010101010101010101010');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.wave-scroll').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: '选择第 32 个比特' }).click();
  await expect(page.getByRole('button', { name: '选择第 32 个比特' })).toHaveAttribute('aria-pressed', 'true');
});
