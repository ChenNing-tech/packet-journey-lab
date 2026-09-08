# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workbench.spec.ts >> 场景栏：收缩图标、临时展开、固定与刷新记忆
- Location: e2e\workbench.spec.ts:5:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator: getByLabel('故障演示', { exact: true })
Expected: focused
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeFocused" with timeout 8000ms
  - waiting for getByLabel('故障演示', { exact: true })

```

```yaml
- banner:
  - heading "数据包传输动画实验室" [level=1]
  - paragraph: PACKET JOURNEY LAB
  - text: 同一局域网内 Ping 等待探索 步骤
  - strong: 1 / 26
  - region "播放控制":
    - button "播放":
      - img
      - text: 播放
    - button "上一步" [disabled]:
      - img
      - text: 上一步
    - button "下一步":
      - text: 下一步
      - img
    - button "重播当前步骤":
      - img
      - text: 重播本步
    - button "重置场景":
      - img
      - text: 重置
    - group "播放速度":
      - button "0.5 倍速": 0.5×
      - button "1 倍速" [pressed]: 1×
      - button "1.5 倍速": 1.5×
      - button "2 倍速": 2×
    - button "课堂讲解" [pressed]: 隐藏课堂讲解
    - button "全屏":
      - img
      - text: 全屏
    - button "使用指南":
      - img
- complementary "实验场景选择":
  - strong: 实验场景 08
  - button "收起实验场景" [expanded]:
    - img
  - button "固定场景栏":
    - img
  - paragraph: 临时展开 · 选完自动收起
  - navigation:
    - button "同一局域网内 Ping":
      - strong: 同一局域网内 Ping
      - text: ARP · ICMP 26 步 入门
      - img
    - button "跨网段 Ping":
      - strong: 跨网段 Ping
      - text: ARP · ICMP 56 步 基础
    - button "ARP 地址解析":
      - strong: ARP 地址解析
      - text: ARP 14 步 入门
    - button "访问 Web 服务器":
      - strong: 访问 Web 服务器
      - text: DNS · ARP · TCP · HTTP 208 步 综合
    - button "DNS 域名解析":
      - strong: DNS 域名解析
      - text: DNS · UDP · ARP 27 步 基础
    - button "DHCP 自动获取地址":
      - strong: DHCP 自动获取地址
      - text: DHCP · UDP 22 步 基础
    - button "TCP 三次握手":
      - strong: TCP 三次握手
      - text: TCP · ARP 72 步 进阶
    - button "TCP 连接释放":
      - strong: TCP 连接释放
      - text: TCP · ARP 137 步 进阶
  - img
  - heading "本节学习目标" [level=3]
  - paragraph: 理解同网段判断、ARP 广播、交换机学习与 ICMP 请求应答。
  - text: ARP ICMP
  - img
  - text: 故障演示 关闭
  - combobox "故障演示 关闭":
    - option "正常通信" [selected]
    - option "IP / 子网掩码配置错误"
    - option "默认网关为空"
    - option "网关不在本地网段"
    - option "目标主机关闭"
    - option "交换机接口关闭"
    - option "路由器接口关闭"
    - option "缺少目标网络路由"
    - option "VLAN 不匹配"
    - option "DNS 服务器地址错误"
    - option "TTL 减为 0"
  - paragraph: 注入故障，找到数据包停下的原因。 自动切换到适用场景并清空状态。
  - img
  - strong: 为理解而实验
  - paragraph: 教学级离散事件仿真 · v1.0
- main:
  - region "网络拓扑动画":
    - heading "网络拓扑 教学仿真" [level=2]:
      - img
      - text: 网络拓扑 教学仿真
    - button "设备表项":
      - img
      - text: 设备表项
    - checkbox "地址标签" [checked]
    - text: 地址标签 观察设备内部处理 点击设备，展开内部表项
    - group "可交互的网络设备与数据包路径":
      - text: PC 终端 网关 / 服务 同一局域网 · 192.168.1.0/24 GE0/2
      - button "查看 PC1 设备详情": PC1 192.168.1.10 …00:00:01:10
      - button "查看 SW1 设备详情": SW1 以太网交换机 VLAN 1 · 3 个端口
      - button "查看 R1 设备详情": R1 192.168.1.1 …00:00:10:01
      - button "查看 PC2 设备详情": PC2 192.168.1.20 …00:00:01:20
      - text: 当前位置：PC1 点击设备，检查 MAC 表、ARP 缓存或路由表
    - text: ARP ICMP TCP DNS DHCP HTTP
    - img
    - text: 文字与颜色同时标识协议 01 准备
    - heading "准备实验环境" [level=3]
    - paragraph: 拓扑已就绪，ARP 缓存与交换机 MAC 表为空。
    - text: 观察提示：动画演示当前过程，右侧表项是本步骤完成后的快照。
    - region "课堂讲解":
      - img
      - heading "第 1 步 · 准备实验环境" [level=3]
      - button "收起课堂讲解" [expanded]:
        - text: 收起
        - img
      - button "关闭课堂讲解":
        - img
      - paragraph:
        - text: 这是确定性的
        - button "查看 离散事件 注释": 离散事件
        - text: 仿真。逐步前进会停在事件完成后的状态；回退和拖动时间线会重建对应步骤的所有表项。
      - img
      - text: 点击带虚线的术语，查看内容注释
      - heading "思考：设备先判断目标 IP 的什么特征？" [level=4]:
        - img
        - text: 思考：设备先判断目标 IP 的什么特征？
      - button "显示答案"
      - group: 常见误区与补充注释
  - complementary "检查窗口":
    - tablist "检查窗口视图":
      - tab "数据包检查器" [selected]:
        - img
        - text: 数据包检查器
      - tab "设备透视 SW1":
        - img
        - text: 设备透视 SW1
    - tabpanel "数据包检查器":
      - region "数据包检查器":
        - heading "数据包检查器" [level=2]
        - button "隐藏字段":
          - img
        - text: 由外到内 · 点击协议层展开
        - img
        - heading "数据包还在准备中" [level=3]
        - paragraph: 此步骤在检查本机状态。 发送数据时，协议字段会在这里展开。
        - text: Ethernet II IPv4 TCP / UDP 应用数据 按「下一步」开始观察
  - region "事件时间线":
    - heading "事件时间线 26 个步骤" [level=2]:
      - img
      - text: 事件时间线 26 个步骤
    - text: 点击步骤或拖动滑块，回到任意时刻 01
    - slider "拖动时间线": "0"
    - text: "26"
    - button "准备通信"
    - button "ARP 地址解析"
    - button "ICMP 请求与应答"
    - button "实验完成"
    - button "步骤 1：准备实验环境":
      - text: 01 准备 当前步骤
      - strong: 准备实验环境
      - text: PC1 · 设备内部
      - paragraph: 拓扑已就绪，ARP 缓存与交换机 MAC 表为空。
    - button "步骤 2：目标在同一网段":
      - text: 02 准备 待执行
      - strong: 目标在同一网段
      - text: PC1 · 设备内部
      - paragraph: 192.168.1.10/24 与 192.168.1.20 网络号相同，直接解析目标 MAC。
    - button "步骤 3：PC1 检查 ARP 缓存":
      - text: 03 ARP 待执行
      - strong: PC1 检查 ARP 缓存
      - text: PC1 · 设备内部
      - paragraph: 未找到 192.168.1.20 的 MAC，先在本链路发送 ARP Request。
    - button "步骤 4：PC1 广播 ARP Request":
      - text: 04 ARP 待执行
      - strong: PC1 广播 ARP Request
      - text: PC1
      - img
      - text: SW1
      - paragraph: 谁拥有 192.168.1.20？请告诉 192.168.1.10。帧目的 MAC 为全 F。
    - button "步骤 5：SW1 学习源 MAC":
      - text: 05 ARP 待执行
      - strong: SW1 学习源 MAC
      - text: SW1 · 设备内部
      - paragraph: 记录 02:00:00:00:01:10 → GE0/1，VLAN 1。学习依据是源地址。
    - button "步骤 6：SW1 泛洪广播":
      - text: 06 ARP 待执行
      - strong: SW1 泛洪广播
      - text: SW1 · 设备内部
      - paragraph: 广播从 GE0/1 进入，复制到其余同 VLAN 端口；不会送回入接口。
    - button "步骤 7：R1 隔离二层广播":
      - text: 07 ARP 待执行
      - strong: R1 隔离二层广播
      - text: R1 · 设备内部
      - paragraph: R1 接口接收本地广播；不从另一侧接口继续转发。若 ARP 目标是本接口，则稍后在本链路应答。
    - button "步骤 8：PC2 识别目标 IP":
      - text: 08 ARP 待执行
      - strong: PC2 识别目标 IP
      - text: PC2 · 设备内部
      - paragraph: ARP 的目标 IP 192.168.1.20 是本接口地址。先记录发送方 IP / MAC，再准备单播应答。
    - button "步骤 9：PC2 单播 ARP Reply":
      - text: 09 ARP 待执行
      - strong: PC2 单播 ARP Reply
      - text: PC2
      - img
      - text: SW1
      - paragraph: 192.168.1.20 对应 02:00:00:00:01:20。直接向请求者的 MAC 应答。
    - button "步骤 10：SW1 学习源 MAC":
      - text: 10 ARP 待执行
      - strong: SW1 学习源 MAC
      - text: SW1 · 设备内部
      - paragraph: 记录 02:00:00:00:01:20 → GE0/3，VLAN 1。学习依据是源地址。
    - button "步骤 11：SW1 查表：已知单播":
      - text: 11 ARP 待执行
      - strong: SW1 查表：已知单播
      - text: SW1 · 设备内部
      - paragraph: 目的 MAC 命中 GE0/1，只向该端口转发；IP 与 TTL 不变。
    - button "步骤 12：SW1 → PC1":
      - text: 12 ARP 待执行
      - strong: SW1 → PC1
      - text: SW1
      - img
      - text: PC1
      - paragraph: 从 GE0/1 发送 ARP Reply，以太网源和目的 MAC 均保持不变。
    - button "步骤 13：PC1 更新 ARP 缓存":
      - text: 13 ARP 待执行
      - strong: PC1 更新 ARP 缓存
      - text: PC1 · 设备内部
      - paragraph: 保存 192.168.1.20 → 02:00:00:00:01:20，此后发送 IPv4 数据时可使用此映射。
    - button "步骤 14：构造 ICMP Echo Request":
      - text: 14 ICMP 待执行
      - strong: 构造 ICMP Echo Request
      - text: PC1 · 设备内部
      - paragraph: Type=8，Code=0；Identifier=0x0042，Sequence=1。ICMP 被装入 IPv4 数据包。
    - button "步骤 15：PC1 发送 ICMP Request":
      - text: 15 ICMP 待执行
      - strong: PC1 发送 ICMP Request
      - text: PC1
      - img
      - text: SW1
      - paragraph: 源 IP 192.168.1.10，目的 IP 192.168.1.20；本段目的 MAC 为 02:00:00:00:01:20。
    - button "步骤 16：SW1 学习源 MAC":
      - text: 16 ICMP 待执行
      - strong: SW1 学习源 MAC
      - text: SW1 · 设备内部
      - paragraph: 记录 02:00:00:00:01:10 → GE0/1，VLAN 1。学习依据是源地址。
    - button "步骤 17：SW1 查表：已知单播":
      - text: 17 ICMP 待执行
      - strong: SW1 查表：已知单播
      - text: SW1 · 设备内部
      - paragraph: 目的 MAC 命中 GE0/3，只向该端口转发；IP 与 TTL 不变。
    - button "步骤 18：SW1 → PC2":
      - text: 18 ICMP 待执行
      - strong: SW1 → PC2
      - text: SW1
      - img
      - text: PC2
      - paragraph: 从 GE0/3 发送 ICMP Request，以太网源和目的 MAC 均保持不变。
    - button "步骤 19：PC2 接收 ICMP Request":
      - text: 19 ICMP 待执行
      - strong: PC2 接收 ICMP Request
      - text: PC2 · 设备内部
      - paragraph: 校验链路帧并逐层解封装，将 ICMP 交给对应协议模块。
    - button "步骤 20：构造 ICMP Echo Reply":
      - text: 20 ICMP 待执行
      - strong: 构造 ICMP Echo Reply
      - text: PC2 · 设备内部
      - paragraph: Type 改为 0；Identifier、Sequence 和回显数据保持一致。源、目的 IP 交换，应答是新的 IP 数据包，初始 TTL=64。
    - button "步骤 21：PC2 发送 ICMP Reply":
      - text: 21 ICMP 待执行
      - strong: PC2 发送 ICMP Reply
      - text: PC2
      - img
      - text: SW1
      - paragraph: 源 IP 192.168.1.20，目的 IP 192.168.1.10；本段目的 MAC 为 02:00:00:00:01:10。
    - button "步骤 22：SW1 学习源 MAC":
      - text: 22 ICMP 待执行
      - strong: SW1 学习源 MAC
      - text: SW1 · 设备内部
      - paragraph: 记录 02:00:00:00:01:20 → GE0/3，VLAN 1。学习依据是源地址。
    - button "步骤 23：SW1 查表：已知单播":
      - text: 23 ICMP 待执行
      - strong: SW1 查表：已知单播
      - text: SW1 · 设备内部
      - paragraph: 目的 MAC 命中 GE0/1，只向该端口转发；IP 与 TTL 不变。
    - button "步骤 24：SW1 → PC1":
      - text: 24 ICMP 待执行
      - strong: SW1 → PC1
      - text: SW1
      - img
      - text: PC1
      - paragraph: 从 GE0/1 发送 ICMP Reply，以太网源和目的 MAC 均保持不变。
    - button "步骤 25：PC1 接收 ICMP Reply":
      - text: 25 ICMP 待执行
      - strong: PC1 接收 ICMP Reply
      - text: PC1 · 设备内部
      - paragraph: 校验链路帧并逐层解封装，将 ICMP 交给对应协议模块。
    - button "步骤 26：本次实验完成":
      - text: 26 准备 待执行
      - strong: 本次实验完成
      - text: PC1 · 设备内部
      - paragraph: 所有事件已完成。回到任意一步，检查协议字段与设备表项，试着解释每次转发的依据。
  - img
  - text: 本实验为教学仿真，不连接真实设备、不发送真实网络请求，也不等同于抓包工具。
  - img
  - text: 确定性事件引擎 本地运行
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | test.beforeEach(async ({ page }) => { await page.goto('/'); });
  4   | 
  5   | test('场景栏：收缩图标、临时展开、固定与刷新记忆', async ({ page }) => {
  6   |   const shell = page.locator('.sidebar-shell');
  7   |   await expect(shell).toHaveClass(/is-pinned/);
  8   |   const original = await page.locator('.main-content').boundingBox();
  9   |   await page.getByRole('button', { name: '收起实验场景', exact: true }).click();
  10  |   await expect(shell).toHaveClass(/is-collapsed/);
  11  |   expect((await page.locator('.main-content').boundingBox())!.width).toBeGreaterThan(original!.width);
  12  |   await expect(page.locator('.scenario-nav button')).toHaveCount(8);
  13  |   await page.locator('.scenario-nav').getByRole('button', { name: 'ARP 地址解析', exact: true }).click();
  14  |   await expect(page.locator('.header-scenario')).toHaveText('ARP 地址解析');
  15  |   await expect(shell).toHaveClass(/is-collapsed/);
  16  |   await page.getByRole('button', { name: '展开实验场景', exact: true }).click();
  17  |   await expect(shell).toHaveClass(/is-expanded.*is-unpinned/);
  18  |   await page.getByRole('button', { name: '跨网段 Ping', exact: true }).click();
  19  |   await expect(shell).toHaveClass(/is-collapsed/);
  20  |   await page.getByRole('button', { name: '展开实验场景', exact: true }).click();
  21  |   await page.getByRole('button', { name: '固定场景栏', exact: true }).click();
  22  |   await page.getByRole('button', { name: 'DNS 域名解析', exact: true }).click();
  23  |   await expect(shell).toHaveClass(/is-expanded.*is-pinned/);
  24  |   await page.reload();
  25  |   await expect(shell).toHaveClass(/is-expanded.*is-pinned/);
  26  |   await page.getByRole('button', { name: '取消固定场景栏', exact: true }).click();
  27  |   await page.locator('.header-scenario').click();
  28  |   await expect(shell).toHaveClass(/is-collapsed/);
  29  |   await page.reload();
  30  |   await expect(shell).toHaveClass(/is-collapsed/);
  31  |   await page.getByRole('button', { name: '展开故障设置', exact: true }).click();
> 32  |   await expect(page.getByLabel('故障演示', { exact: true })).toBeFocused();
      |                                                          ^ Error: expect(locator).toBeFocused() failed
  33  |   await page.keyboard.press('Escape');
  34  |   await expect(shell).toHaveClass(/is-collapsed/);
  35  |   await expect(page.getByRole('button', { name: '展开实验场景', exact: true })).toBeFocused();
  36  | });
  37  | 
  38  | test('拓扑内讲解：术语注释、收起、问答重置与关闭恢复', async ({ page }) => {
  39  |   await expect(page.locator('.page-heading')).toHaveCount(0);
  40  |   const teacher = page.locator('.topology-canvas .teacher-float');
  41  |   await expect(teacher).toBeVisible();
  42  |   const map = await page.locator('.topology-svg').boundingBox();
  43  |   expect((await teacher.boundingBox())!.y).toBeGreaterThanOrEqual(map!.y + map!.height);
  44  |   await page.getByRole('button', { name: '查看 离散事件 注释', exact: true }).click();
  45  |   await expect(page.locator('.term-annotation')).toBeVisible();
  46  |   await expect(page.locator('.term-annotation')).toContainText('发送、收帧、查表');
  47  |   await page.getByRole('button', { name: '显示答案', exact: true }).click();
  48  |   await expect(page.locator('.answer')).toBeVisible();
  49  |   const expanded = await teacher.boundingBox();
  50  |   await page.getByRole('button', { name: '收起课堂讲解', exact: true }).click();
  51  |   await expect(page.locator('.teacher-body')).toBeHidden();
  52  |   expect((await teacher.boundingBox())!.height).toBeLessThan(expanded!.height);
  53  |   await page.getByRole('button', { name: '展开课堂讲解', exact: true }).click();
  54  |   await page.getByTestId('event-1').click();
  55  |   await expect(page.locator('.teacher-float-header h3')).toContainText('第 2 步');
  56  |   await expect(page.locator('.answer')).toHaveCount(0);
  57  |   await expect(page.locator('.term-annotation')).toBeHidden();
  58  |   await page.getByRole('button', { name: '关闭课堂讲解', exact: true }).click();
  59  |   await expect(teacher).toHaveCount(0);
  60  |   await page.getByRole('button', { name: '课堂讲解', exact: true }).click();
  61  |   await expect(teacher).toBeVisible();
  62  | });
  63  | 
  64  | test('右侧检查窗口：设备自动切换、地址横向滚动与键盘标签', async ({ page }) => {
  65  |   await page.getByRole('button', { name: '跨网段 Ping', exact: true }).click();
  66  |   await page.getByTestId('event-33').click();
  67  |   await page.getByRole('button', { name: '查看 R1 设备详情', exact: true }).click();
  68  |   await expect(page.getByRole('tab', { name: /设备透视/ })).toHaveAttribute('aria-selected', 'true');
  69  |   await expect(page.locator('#packet-view')).toBeHidden();
  70  |   await expect(page.locator('#device-view .matched-route')).toContainText('192.168.20.0/24');
  71  |   await page.getByRole('button', { name: /地址变化表/ }).click();
  72  |   await expect(page.locator('#device-view .address-table tbody tr')).toHaveCount(2);
  73  |   expect(await page.locator('#device-view .address-view .table-scroll').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  74  |   const currentStep = await page.getByTestId('step-counter').textContent();
  75  |   await page.getByRole('tab', { name: /设备透视/ }).focus();
  76  |   await page.keyboard.press('ArrowLeft');
  77  |   await expect(page.getByRole('tab', { name: '数据包检查器', exact: true })).toBeFocused();
  78  |   await expect(page.locator('#packet-view')).toBeVisible();
  79  |   await page.keyboard.press('ArrowRight');
  80  |   await expect(page.getByRole('tab', { name: /设备透视/ })).toBeFocused();
  81  |   await expect(page.locator('#device-view')).toBeVisible();
  82  |   await expect(page.getByTestId('step-counter')).toHaveText(currentStep!);
  83  |   await page.keyboard.press('Escape');
  84  |   await expect(page.locator('#packet-view')).toBeVisible();
  85  | });
  86  | 
  87  | test('工作台响应式与实际截图：面板不溢出、讲解不遮挡设备', async ({ page }) => {
  88  |   for (const width of [1672, 1440, 1280, 1024, 768, 390, 320]) {
  89  |     await page.setViewportSize({ width, height: 1000 });
  90  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`).toBe(true);
  91  |     const area = await page.locator('.topology-canvas').boundingBox();
  92  |     const teacher = await page.locator('.teacher-float').boundingBox();
  93  |     expect(teacher!.x).toBeGreaterThanOrEqual(area!.x);
  94  |     expect(teacher!.x + teacher!.width).toBeLessThanOrEqual(area!.x + area!.width + 1);
  95  |   }
  96  |   await page.setViewportSize({ width: 1672, height: 1000 });
  97  |   await page.getByRole('button', { name: '收起实验场景', exact: true }).click();
  98  |   await page.getByRole('button', { name: '跨网段 Ping', exact: true }).click();
  99  |   await page.getByTestId('event-33').click();
  100 |   await page.getByRole('button', { name: '查看 R1 设备详情', exact: true }).click();
  101 |   await page.getByRole('button', { name: '查看 NAT 注释', exact: true }).click();
  102 |   await page.evaluate(() => window.scrollTo(0, 0));
  103 |   await page.screenshot({ path: 'artifacts/workbench-device-teaching.png', fullPage: true });
  104 |   await page.getByRole('tab', { name: '数据包检查器', exact: true }).click();
  105 |   await page.screenshot({ path: 'artifacts/workbench-packet-teaching.png', fullPage: true });
  106 |   await page.setViewportSize({ width: 390, height: 844 });
  107 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  108 |   await page.screenshot({ path: 'artifacts/workbench-mobile.png', fullPage: true });
  109 | });
  110 | 
```