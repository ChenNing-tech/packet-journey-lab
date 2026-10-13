export type SwitchingMode = 'circuit' | 'message' | 'packet';
export type RoutingRule = 'load-balance' | 'lowest-delay';
export type LinkStatus = 'normal' | 'congested' | 'failed';
export type SwitchingNodeId = 'A' | 'R1' | 'R2' | 'R3' | 'R4' | 'B';

export interface SwitchingNode {
  id: SwitchingNodeId;
  label: string;
  type: 'pc' | 'router' | 'server';
  x: number;
  y: number;
}

export interface SwitchingLink {
  id: string;
  from: SwitchingNodeId;
  to: SwitchingNodeId;
  delayFactor: number;
}

export interface NetworkAction {
  timeMs: number;
  linkId: string;
  status: LinkStatus;
}

export interface SwitchingConfig {
  mode: SwitchingMode;
  message: string;
  messageBytes: number;
  packetSizeBytes: number;
  linkRateMbps: number;
  propagationDelayMs: number;
  queueDelayMs: number;
  routingRule: RoutingRule;
  networkActions: NetworkAction[];
}

export type SwitchingEventType =
  | 'SIMULATION_START' | 'LINK_STATUS_CHANGE' | 'CIRCUIT_SETUP_START' | 'CIRCUIT_RESERVE'
  | 'CIRCUIT_ESTABLISHED' | 'CIRCUIT_RELEASE_START' | 'CIRCUIT_RELEASE' | 'CIRCUIT_RELEASED'
  | 'UNIT_CREATED' | 'UNIT_QUEUED' | 'UNIT_FORWARD' | 'LINK_SEND' | 'NODE_RECEIVE'
  | 'UNIT_STORED' | 'UNIT_ARRIVED' | 'REROUTE' | 'WAITING_FOR_ROUTE' | 'BLOCKED'
  | 'CIRCUIT_BROKEN' | 'SIMULATION_COMPLETE';

export interface SwitchingEvent {
  id: string;
  index: number;
  sequence: number;
  timeMs: number;
  type: SwitchingEventType;
  phase: string;
  label: string;
  description: string;
  unitId?: string;
  unitIndex?: number;
  payloadBytes?: number;
  nodeId?: SwitchingNodeId;
  from?: SwitchingNodeId;
  to?: SwitchingNodeId;
  linkId?: string;
  path?: SwitchingNodeId[];
  linkStatus?: LinkStatus;
}

export interface DataUnit {
  id: string;
  index: number;
  payloadBytes: number;
  transmittedBytes: number;
  destination: SwitchingNodeId;
  payload: string;
}

export interface SwitchingResult {
  config: SwitchingConfig;
  units: DataUnit[];
  events: SwitchingEvent[];
  completed: boolean;
  arrivalOrder: string[];
  reassembledOrder: string[];
  durationMs: number;
}

export interface SwitchingSnapshot {
  connection: 'idle' | 'establishing' | 'connected' | 'releasing' | 'released' | 'broken';
  linkStates: Record<string, LinkStatus>;
  reservedLinks: string[];
  nodeStates: Partial<Record<SwitchingNodeId, string>>;
  unitLocations: Record<string, { kind: 'node' | 'link'; node?: SwitchingNodeId; from?: SwitchingNodeId; to?: SwitchingNodeId }>;
  arrivalOrder: string[];
  logs: SwitchingEvent[];
}

export const SWITCHING_NODES: SwitchingNode[] = [
  { id: 'A', label: '发送端 A', type: 'pc', x: 80, y: 220 },
  { id: 'R1', label: 'R1', type: 'router', x: 245, y: 105 },
  { id: 'R2', label: 'R2', type: 'router', x: 245, y: 335 },
  { id: 'R3', label: 'R3', type: 'router', x: 505, y: 105 },
  { id: 'R4', label: 'R4', type: 'router', x: 505, y: 335 },
  { id: 'B', label: '接收端 B', type: 'server', x: 690, y: 220 },
];

export const SWITCHING_LINKS: SwitchingLink[] = [
  { id: 'A-R1', from: 'A', to: 'R1', delayFactor: .75 },
  { id: 'R1-R3', from: 'R1', to: 'R3', delayFactor: .75 },
  { id: 'R3-B', from: 'R3', to: 'B', delayFactor: .75 },
  { id: 'A-R2', from: 'A', to: 'R2', delayFactor: 1.25 },
  { id: 'R2-R4', from: 'R2', to: 'R4', delayFactor: 1.25 },
  { id: 'R4-B', from: 'R4', to: 'B', delayFactor: 1.25 },
  { id: 'R1-R2', from: 'R1', to: 'R2', delayFactor: 1 },
  { id: 'R3-R4', from: 'R3', to: 'R4', delayFactor: 1 },
];

export const DEFAULT_SWITCHING_CONFIG: SwitchingConfig = {
  mode: 'packet',
  message: 'HELLO NETWORK',
  messageBytes: 1200,
  packetSizeBytes: 400,
  linkRateMbps: 1,
  propagationDelayMs: 40,
  queueDelayMs: 35,
  routingRule: 'load-balance',
  networkActions: [],
};

const UPPER_PATH: SwitchingNodeId[] = ['A', 'R1', 'R3', 'B'];
const LOWER_PATH: SwitchingNodeId[] = ['A', 'R2', 'R4', 'B'];

function linkBetween(from: SwitchingNodeId, to: SwitchingNodeId) {
  return SWITCHING_LINKS.find(link => (link.from === from && link.to === to) || (link.from === to && link.to === from));
}

export function linkStatusAt(linkId: string, timeMs: number, actions: NetworkAction[]): LinkStatus {
  return actions
    .filter(action => action.linkId === linkId && action.timeMs <= timeMs)
    .sort((a, b) => a.timeMs - b.timeMs)
    .at(-1)?.status ?? 'normal';
}

function transmissionMs(bytes: number, rateMbps: number, status: LinkStatus) {
  const effectiveRate = status === 'congested' ? rateMbps * .4 : rateMbps;
  return bytes * 8 / (effectiveRate * 1_000_000) * 1000;
}

function propagationMs(link: SwitchingLink, config: SwitchingConfig, status: LinkStatus) {
  return config.propagationDelayMs * link.delayFactor * (status === 'congested' ? 1.6 : 1);
}

function pathAvailable(path: SwitchingNodeId[], timeMs: number, actions: NetworkAction[]) {
  return path.slice(0, -1).every((node, index) => {
    const link = linkBetween(node, path[index + 1]);
    return link && linkStatusAt(link.id, timeMs, actions) !== 'failed';
  });
}

function pathCost(path: SwitchingNodeId[], timeMs: number, config: SwitchingConfig, bytes: number) {
  return path.slice(0, -1).reduce((total, node, index) => {
    const link = linkBetween(node, path[index + 1]);
    if (!link) return Number.POSITIVE_INFINITY;
    const status = linkStatusAt(link.id, timeMs, config.networkActions);
    if (status === 'failed') return Number.POSITIVE_INFINITY;
    return total + propagationMs(link, config, status) + transmissionMs(bytes, config.linkRateMbps, status) + (status === 'congested' ? config.queueDelayMs * 2 : 0);
  }, 0);
}

export function findAvailablePath(from: SwitchingNodeId, to: SwitchingNodeId, timeMs: number, config: SwitchingConfig, bytes: number): SwitchingNodeId[] | null {
  const distances = new Map<SwitchingNodeId, number>(SWITCHING_NODES.map(node => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map<SwitchingNodeId, SwitchingNodeId>();
  const unvisited = new Set<SwitchingNodeId>(SWITCHING_NODES.map(node => node.id));
  distances.set(from, 0);

  while (unvisited.size) {
    const current = [...unvisited].sort((a, b) => (distances.get(a)! - distances.get(b)!) || a.localeCompare(b))[0];
    if (!Number.isFinite(distances.get(current)!)) break;
    unvisited.delete(current);
    if (current === to) break;
    const links = SWITCHING_LINKS.filter(link => link.from === current || link.to === current);
    for (const link of links) {
      const status = linkStatusAt(link.id, timeMs, config.networkActions);
      if (status === 'failed') continue;
      const neighbor = link.from === current ? link.to : link.from;
      if (!unvisited.has(neighbor)) continue;
      const cost = propagationMs(link, config, status) + transmissionMs(bytes, config.linkRateMbps, status) + (status === 'congested' ? config.queueDelayMs * 2 : 0);
      const candidate = distances.get(current)! + cost;
      if (candidate < distances.get(neighbor)!) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
      }
    }
  }
  if (!Number.isFinite(distances.get(to)!)) return null;
  const path: SwitchingNodeId[] = [to];
  while (path[0] !== from) {
    const parent = previous.get(path[0]);
    if (!parent) return null;
    path.unshift(parent);
  }
  return path;
}

function preferredPacketPath(unitIndex: number, timeMs: number, config: SwitchingConfig, bytes: number) {
  if (config.routingRule === 'load-balance') {
    const preferred = unitIndex % 2 === 1 ? UPPER_PATH : LOWER_PATH;
    if (pathAvailable(preferred, timeMs, config.networkActions)) return preferred;
    const other = unitIndex % 2 === 1 ? LOWER_PATH : UPPER_PATH;
    if (pathAvailable(other, timeMs, config.networkActions)) return other;
  }
  const options = [UPPER_PATH, LOWER_PATH].filter(path => pathAvailable(path, timeMs, config.networkActions));
  if (options.length) return options.sort((a, b) => pathCost(a, timeMs, config, bytes) - pathCost(b, timeMs, config, bytes))[0];
  return findAvailablePath('A', 'B', timeMs, config, bytes);
}

function createUnits(config: SwitchingConfig): DataUnit[] {
  if (config.mode !== 'packet') return [{ id: config.mode === 'message' ? 'M1' : 'DATA', index: 1, payloadBytes: config.messageBytes, transmittedBytes: config.messageBytes, destination: 'B', payload: config.message }];
  const count = Math.ceil(config.messageBytes / config.packetSizeBytes);
  return Array.from({ length: count }, (_, index) => {
    const payloadBytes = Math.min(config.packetSizeBytes, config.messageBytes - index * config.packetSizeBytes);
    return { id: `P${index + 1}`, index: index + 1, payloadBytes, transmittedBytes: payloadBytes + 24, destination: 'B' as const, payload: `${config.message} · ${index + 1}/${count}` };
  });
}

interface PendingTask {
  timeMs: number;
  sequence: number;
  unit: DataUnit;
  node: SwitchingNodeId;
  route: SwitchingNodeId[] | null;
}

export function simulateSwitching(input: SwitchingConfig): SwitchingResult {
  const config: SwitchingConfig = { ...input, messageBytes: Math.max(1, input.messageBytes), packetSizeBytes: Math.max(1, input.packetSizeBytes), linkRateMbps: Math.max(.1, input.linkRateMbps), propagationDelayMs: Math.max(0, input.propagationDelayMs), queueDelayMs: Math.max(0, input.queueDelayMs), networkActions: [...input.networkActions].sort((a, b) => a.timeMs - b.timeMs || a.linkId.localeCompare(b.linkId)) };
  const units = createUnits(config);
  const events: Omit<SwitchingEvent, 'id' | 'index'>[] = [];
  let sequence = 0;
  const emit = (event: Omit<SwitchingEvent, 'id' | 'index' | 'sequence'>) => events.push({ ...event, sequence: sequence++ });
  emit({ timeMs: 0, type: 'SIMULATION_START', phase: '准备', label: '开始实验', description: `使用 ${config.messageBytes} B 数据执行${config.mode === 'circuit' ? '电路交换' : config.mode === 'message' ? '报文交换' : '分组交换'}。` });
  for (const action of config.networkActions) emit({ timeMs: action.timeMs, type: 'LINK_STATUS_CHANGE', phase: '链路变化', label: `${action.linkId} ${action.status === 'normal' ? '恢复' : action.status === 'failed' ? '故障' : '拥塞'}`, description: `链路 ${action.linkId} 状态更新为${action.status === 'normal' ? '正常' : action.status === 'failed' ? '故障' : '拥塞'}。`, linkId: action.linkId, linkStatus: action.status });

  const arrivalOrder: string[] = [];
  if (config.mode === 'circuit') {
    simulateCircuit(config, units[0], emit, arrivalOrder);
  } else {
    simulateStoreAndForward(config, units, emit, arrivalOrder);
  }

  const completed = arrivalOrder.length === units.length;
  const lastTime = events.reduce((maximum, event) => Math.max(maximum, event.timeMs), 0);
  emit({ timeMs: lastTime + 1, type: 'SIMULATION_COMPLETE', phase: completed ? '完成' : '中断', label: completed ? '传输完成' : '传输未完成', description: completed ? `接收端 B 已收到全部 ${units.length} 个传输单元。` : `仅收到 ${arrivalOrder.length}/${units.length} 个传输单元，请检查链路状态。`, nodeId: 'B' });
  const sorted = events.sort((a, b) => a.timeMs - b.timeMs || a.sequence - b.sequence).map((event, index): SwitchingEvent => ({ ...event, index, id: `switch-event-${index}` }));
  return { config, units, events: sorted, completed, arrivalOrder, reassembledOrder: units.map(unit => unit.id), durationMs: sorted.at(-1)?.timeMs ?? 0 };
}

function simulateCircuit(config: SwitchingConfig, unit: DataUnit, emit: (event: Omit<SwitchingEvent, 'id' | 'index' | 'sequence'>) => void, arrivalOrder: string[]) {
  let path = findAvailablePath('A', 'B', 0, config, 64);
  emit({ timeMs: 0, type: 'CIRCUIT_SETUP_START', phase: '建立连接', label: '发送连接建立请求', description: '先寻找端到端可用路径，数据暂时不能发送。', nodeId: 'A', path: path ?? undefined });
  if (!path) {
    emit({ timeMs: 0, type: 'BLOCKED', phase: '建立连接', label: '无可用通路', description: '当前没有从 A 到 B 的真实可用路径，不能建立连接。', nodeId: 'A' });
    return;
  }
  let time = 0;
  const reserved: string[] = [];
  let attempts = 0;
  while (true) {
    let failedLink: SwitchingLink | undefined;
    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index];
      const to = path[index + 1];
      const link = linkBetween(from, to)!;
      const status = linkStatusAt(link.id, time, config.networkActions);
      if (status === 'failed') {
        failedLink = link;
        break;
      }
      emit({ timeMs: time, type: 'CIRCUIT_RESERVE', phase: '建立连接', label: `预留 ${link.id}`, description: `为连接预留 ${from} 到 ${to} 的链路资源。`, linkId: link.id, from, to, path });
      reserved.push(link.id);
      time += transmissionMs(64, config.linkRateMbps, status) + propagationMs(link, config, status);
      failedLink = path.slice(0, index + 2).slice(0, -1).map((node, linkIndex) => linkBetween(node, path![linkIndex + 1])!).find(item => linkStatusAt(item.id, time, config.networkActions) === 'failed');
      if (failedLink) break;
    }
    if (!failedLink && pathAvailable(path, time, config.networkActions)) break;
    failedLink ??= path.slice(0, -1).map((node, index) => linkBetween(node, path![index + 1])!).find(link => linkStatusAt(link.id, time, config.networkActions) === 'failed');
    for (const linkId of [...reserved].reverse()) {
      const reservedLink = SWITCHING_LINKS.find(item => item.id === linkId)!;
      emit({ timeMs: time, type: 'CIRCUIT_RELEASE', phase: '建立连接', label: `撤销 ${linkId} 预留`, description: '连接尚未建立，因链路故障撤销此前资源预留。', linkId, from: reservedLink.to, to: reservedLink.from, path });
    }
    reserved.length = 0;
    const replacement = findAvailablePath('A', 'B', time, config, 64);
    if (!replacement || attempts > config.networkActions.length + 2) {
      emit({ timeMs: time, type: 'BLOCKED', phase: '建立连接', label: '连接建立失败', description: `${failedLink?.id ?? '候选通路'} 故障且没有可用替代路径。`, linkId: failedLink?.id, nodeId: 'A' });
      return;
    }
    emit({ timeMs: time, type: 'REROUTE', phase: '建立连接', label: '重新选择通路', description: `${failedLink?.id ?? '原通路'} 不可用，撤销已有预留并改走 ${replacement.join(' → ')}。`, linkId: failedLink?.id, nodeId: 'A', path: replacement });
    path = replacement;
    time += .01;
    attempts += 1;
  }
  emit({ timeMs: time, type: 'CIRCUIT_ESTABLISHED', phase: '建立连接', label: '端到端连接已建立', description: `通路 ${path.join(' → ')} 已完成资源预留，现在才允许传输数据。`, nodeId: 'B', path });
  const dataStart = time + 1;
  emit({ timeMs: dataStart, type: 'UNIT_CREATED', phase: '传输数据', label: '数据进入专用通路', description: `${unit.payloadBytes} B 数据开始沿已建立通路连续发送。`, unitId: unit.id, unitIndex: unit.index, payloadBytes: unit.payloadBytes, nodeId: 'A', path });
  const serialization = transmissionMs(unit.transmittedBytes, config.linkRateMbps, 'normal');
  let propagationTotal = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    const link = linkBetween(from, to)!;
    const linkStart = dataStart + propagationTotal;
    const status = linkStatusAt(link.id, linkStart, config.networkActions);
    if (status === 'failed') {
      emit({ timeMs: linkStart, type: 'CIRCUIT_BROKEN', phase: '传输数据', label: '已建立连接中断', description: `${link.id} 在数据传输期间故障。电路交换不能把现有连接直接迁移到另一条路径。`, linkId: link.id, nodeId: from, unitId: unit.id });
      return;
    }
    emit({ timeMs: linkStart, type: 'LINK_SEND', phase: '传输数据', label: `数据通过 ${link.id}`, description: `数据流沿预留链路从 ${from} 传向 ${to}，中间节点不存储完整报文。`, linkId: link.id, from, to, unitId: unit.id, unitIndex: unit.index, payloadBytes: unit.payloadBytes, path });
    propagationTotal += propagationMs(link, config, status);
  }
  const arrival = dataStart + serialization + propagationTotal;
  emit({ timeMs: arrival, type: 'UNIT_ARRIVED', phase: '传输数据', label: '数据到达接收端', description: '接收端 B 已通过专用通路收到全部数据。', unitId: unit.id, unitIndex: unit.index, payloadBytes: unit.payloadBytes, nodeId: 'B', path });
  arrivalOrder.push(unit.id);
  let releaseTime = arrival + 1;
  emit({ timeMs: releaseTime, type: 'CIRCUIT_RELEASE_START', phase: '释放连接', label: '开始释放连接', description: '传输结束，沿通路逐段释放预留资源。', nodeId: 'B', path });
  for (const linkId of [...reserved].reverse()) {
    const link = SWITCHING_LINKS.find(item => item.id === linkId)!;
    emit({ timeMs: releaseTime, type: 'CIRCUIT_RELEASE', phase: '释放连接', label: `释放 ${linkId}`, description: `链路 ${linkId} 的预留资源恢复为可共享状态。`, linkId, from: link.to, to: link.from, path });
    releaseTime += 2;
  }
  emit({ timeMs: releaseTime, type: 'CIRCUIT_RELEASED', phase: '释放连接', label: '连接已释放', description: '端到端连接关闭，所有预留链路均已释放。', nodeId: 'A', path });
}

function simulateStoreAndForward(config: SwitchingConfig, units: DataUnit[], emit: (event: Omit<SwitchingEvent, 'id' | 'index' | 'sequence'>) => void, arrivalOrder: string[]) {
  const tasks: PendingTask[] = [];
  let taskSequence = 0;
  const linkAvailable = new Map<string, number>();
  for (const unit of units) {
    const route = config.mode === 'packet' ? preferredPacketPath(unit.index, 0, config, unit.transmittedBytes) : findAvailablePath('A', 'B', 0, config, unit.transmittedBytes);
    emit({ timeMs: 0, type: 'UNIT_CREATED', phase: config.mode === 'packet' ? '拆分分组' : '生成报文', label: config.mode === 'packet' ? `生成 ${unit.id}` : '生成完整报文', description: `${unit.id}：目的地 B，载荷 ${unit.payloadBytes} B${config.mode === 'packet' ? '，另含 24 B 教学首部' : ''}。`, unitId: unit.id, unitIndex: unit.index, payloadBytes: unit.payloadBytes, nodeId: 'A', path: route ?? undefined });
    tasks.push({ timeMs: 0, sequence: taskSequence++, unit, node: 'A', route });
  }

  while (tasks.length) {
    tasks.sort((a, b) => a.timeMs - b.timeMs || a.unit.index - b.unit.index || a.sequence - b.sequence);
    const task = tasks.shift()!;
    if (task.node === 'B') {
      emit({ timeMs: task.timeMs, type: 'UNIT_ARRIVED', phase: '接收整理', label: `${task.unit.id} 到达 B`, description: `${task.unit.id} 完整到达接收端，当前到达顺序为 ${[...arrivalOrder, task.unit.id].join(' → ')}。`, unitId: task.unit.id, unitIndex: task.unit.index, payloadBytes: task.unit.payloadBytes, nodeId: 'B', path: task.route ?? undefined });
      arrivalOrder.push(task.unit.id);
      continue;
    }

    let route = task.route;
    if (!route || route[0] !== task.node || route.length < 2) route = findAvailablePath(task.node, 'B', task.timeMs, config, task.unit.transmittedBytes);
    if (!route) {
      const recovery = config.networkActions.find(action => action.timeMs > task.timeMs && action.status !== 'failed');
      if (recovery) {
        emit({ timeMs: task.timeMs, type: 'WAITING_FOR_ROUTE', phase: '等待路由', label: `${task.unit.id} 等待可用路径`, description: `从 ${task.node} 到 B 暂无可用路径，等待后续链路恢复事件。`, unitId: task.unit.id, unitIndex: task.unit.index, nodeId: task.node });
        tasks.push({ ...task, timeMs: recovery.timeMs + .01, sequence: taskSequence++, route: null });
      } else emit({ timeMs: task.timeMs, type: 'BLOCKED', phase: '传输中断', label: `${task.unit.id} 无路可走`, description: `从 ${task.node} 到 B 没有真实可用的替代路径，分组不会跳过节点或虚构到达。`, unitId: task.unit.id, unitIndex: task.unit.index, nodeId: task.node });
      continue;
    }

    let next = route[1];
    let link = linkBetween(task.node, next)!;
    const baseQueue = task.node === 'A' ? 0 : config.queueDelayMs;
    let sendAt = Math.max(task.timeMs + baseQueue, linkAvailable.get(link.id) ?? 0);
    let status = linkStatusAt(link.id, sendAt, config.networkActions);
    if (status === 'failed') {
      const replacement = findAvailablePath(task.node, 'B', sendAt, config, task.unit.transmittedBytes);
      if (!replacement) {
        tasks.push({ ...task, timeMs: sendAt, sequence: taskSequence++, route: null });
        continue;
      }
      emit({ timeMs: sendAt, type: 'REROUTE', phase: '重新选路', label: `${task.unit.id} 重新选路`, description: `${link.id} 已故障，${task.unit.id} 从 ${task.node} 改走 ${replacement.join(' → ')}。`, unitId: task.unit.id, unitIndex: task.unit.index, nodeId: task.node, linkId: link.id, path: replacement });
      route = replacement;
      next = route[1];
      link = linkBetween(task.node, next)!;
      sendAt = Math.max(task.timeMs + baseQueue, linkAvailable.get(link.id) ?? 0);
      status = linkStatusAt(link.id, sendAt, config.networkActions);
    }
    if (status === 'congested') sendAt += config.queueDelayMs * 2;
    if (sendAt > task.timeMs) emit({ timeMs: task.timeMs, type: 'UNIT_QUEUED', phase: '排队等待', label: `${task.unit.id} 在 ${task.node} 排队`, description: `${task.unit.id} 已完整存储，等待 ${Math.round(sendAt - task.timeMs)} ms 后获得链路发送机会。`, unitId: task.unit.id, unitIndex: task.unit.index, nodeId: task.node, linkId: link.id, path: route });
    emit({ timeMs: sendAt, type: 'UNIT_FORWARD', phase: '存储转发', label: `${task.node} 转发 ${task.unit.id}`, description: `${task.node} 已完整接收 ${task.unit.id}，现在开始向 ${next} 转发。`, unitId: task.unit.id, unitIndex: task.unit.index, payloadBytes: task.unit.payloadBytes, nodeId: task.node, linkId: link.id, path: route });
    emit({ timeMs: sendAt + .001, type: 'LINK_SEND', phase: '链路传输', label: `${task.unit.id}：${task.node} → ${next}`, description: `${task.unit.id} 正在链路 ${link.id} 上发送，状态为${status === 'congested' ? '拥塞' : '正常'}。`, unitId: task.unit.id, unitIndex: task.unit.index, payloadBytes: task.unit.payloadBytes, from: task.node, to: next, linkId: link.id, path: route });
    const txEnd = sendAt + transmissionMs(task.unit.transmittedBytes, config.linkRateMbps, status);
    const arrival = txEnd + propagationMs(link, config, status);
    linkAvailable.set(link.id, txEnd);
    emit({ timeMs: arrival, type: 'NODE_RECEIVE', phase: '完整接收', label: `${next} 收到 ${task.unit.id}`, description: `${task.unit.id} 的最后一个比特到达 ${next}，本跳接收完成。`, unitId: task.unit.id, unitIndex: task.unit.index, payloadBytes: task.unit.payloadBytes, nodeId: next, from: task.node, to: next, linkId: link.id, path: route });
    if (next !== 'B') emit({ timeMs: arrival + .001, type: 'UNIT_STORED', phase: '存储转发', label: `${task.unit.id} 已存储`, description: `${next} 已完整存储 ${task.unit.id}，之后才能排队并转发到下一跳。`, unitId: task.unit.id, unitIndex: task.unit.index, payloadBytes: task.unit.payloadBytes, nodeId: next, path: route.slice(1) });
    tasks.push({ timeMs: arrival + .002, sequence: taskSequence++, unit: task.unit, node: next, route: route.slice(1) });
  }
}

export function deriveSwitchingSnapshot(events: SwitchingEvent[], index: number): SwitchingSnapshot {
  const snapshot: SwitchingSnapshot = {
    connection: 'idle',
    linkStates: Object.fromEntries(SWITCHING_LINKS.map(link => [link.id, 'normal'])) as Record<string, LinkStatus>,
    reservedLinks: [],
    nodeStates: {},
    unitLocations: {},
    arrivalOrder: [],
    logs: [],
  };
  for (const event of events.slice(0, index + 1)) {
    snapshot.logs.push(event);
    if (event.type === 'LINK_STATUS_CHANGE' && event.linkId && event.linkStatus) snapshot.linkStates[event.linkId] = event.linkStatus;
    if (event.type === 'CIRCUIT_SETUP_START') snapshot.connection = 'establishing';
    if (event.type === 'CIRCUIT_ESTABLISHED') snapshot.connection = 'connected';
    if (event.type === 'CIRCUIT_RELEASE_START') snapshot.connection = 'releasing';
    if (event.type === 'CIRCUIT_RELEASED') snapshot.connection = 'released';
    if (event.type === 'CIRCUIT_BROKEN' || event.type === 'BLOCKED') snapshot.connection = 'broken';
    if (event.type === 'CIRCUIT_RESERVE' && event.linkId && !snapshot.reservedLinks.includes(event.linkId)) snapshot.reservedLinks.push(event.linkId);
    if (event.type === 'CIRCUIT_RELEASE' && event.linkId) snapshot.reservedLinks = snapshot.reservedLinks.filter(link => link !== event.linkId);
    if (event.nodeId) snapshot.nodeStates[event.nodeId] = event.label;
    if (event.unitId && event.type === 'LINK_SEND' && event.from && event.to) snapshot.unitLocations[event.unitId] = { kind: 'link', from: event.from, to: event.to };
    if (event.unitId && event.nodeId && ['UNIT_CREATED', 'UNIT_QUEUED', 'UNIT_FORWARD', 'NODE_RECEIVE', 'UNIT_STORED', 'UNIT_ARRIVED', 'BLOCKED', 'WAITING_FOR_ROUTE'].includes(event.type)) snapshot.unitLocations[event.unitId] = { kind: 'node', node: event.nodeId };
    if (event.type === 'UNIT_ARRIVED' && event.unitId && !snapshot.arrivalOrder.includes(event.unitId)) snapshot.arrivalOrder.push(event.unitId);
  }
  return snapshot;
}
