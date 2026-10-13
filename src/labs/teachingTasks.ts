import type { SignalEncodingMode } from './signalEncoding';
import type { NetworkAction, SwitchingMode } from './switchingSimulation';

export type LearningMode = 'demo' | 'explore';
export type SignalTaskId = 'signal-nrz-10110' | 'signal-compare-ones' | 'signal-decode';
export type SwitchingTaskId = 'switch-circuit' | 'switch-message' | 'switch-four-packets' | 'switch-link-change';
export type TeachingTaskId = SignalTaskId | SwitchingTaskId;

export interface TeachingTaskDefinition<T extends TeachingTaskId = TeachingTaskId> {
  id: T;
  title: string;
  goal: string;
  steps: string[];
  hint: string;
  completion: string;
}

export interface ExperimentAction {
  at: string;
  type: string;
  detail: string;
  configuration?: Record<string, unknown>;
}

export interface ExperimentRecord {
  schemaVersion: 1;
  laboratory: string;
  startedAt: string;
  exportedAt: string;
  privacy: string;
  learningMode: LearningMode;
  configuration: Record<string, unknown>;
  actions: ExperimentAction[];
  observations: string[];
  tasks: Array<{ id: TeachingTaskId; title: string; status: 'completed' | 'incomplete' }>;
}

export const SIGNAL_TASKS: TeachingTaskDefinition<SignalTaskId>[] = [
  {
    id: 'signal-nrz-10110',
    title: '任务 1 · 观察 NRZ-L',
    goal: '理解 1、0 与高低电平的对应关系。',
    steps: ['输入 10110', '选择 NRZ-L', '逐位播放或单步观察'],
    hint: '注意第 3、4 位连续为 1 时，位边界不会跳变。',
    completion: '已实际观察 10110 的全部 5 个位区间。',
  },
  {
    id: 'signal-compare-ones',
    title: '任务 2 · 比较连续 1',
    goal: '比较连续相同比特在两种编码中的跳变差异。',
    steps: ['输入 111111', '开启双编码对比', '沿同一时间轴观察全部比特'],
    hint: 'NRZ-L 保持高电平；曼彻斯特每个比特中点仍会跳变。',
    completion: '双编码对比开启，并观察全部 6 个位区间。',
  },
  {
    id: 'signal-decode',
    title: '任务 3 · 波形解码',
    goal: '根据电平和中点跳变还原隐藏的二进制序列。',
    steps: ['进入波形解码', '逐位判断并填写答案', '检查答案'],
    hint: '先看每个比特中点的跳变方向，再判断是 0 还是 1。',
    completion: '系统逐位判定全部正确。',
  },
];

export const SWITCHING_TASKS: TeachingTaskDefinition<SwitchingTaskId>[] = [
  {
    id: 'switch-circuit',
    title: '任务 1 · 电路交换',
    goal: '理解建立、传输和释放三个阶段。',
    steps: ['切换电路交换', '观察端到端资源预留', '继续到数据到达和资源释放'],
    hint: '连接建立完成前，不应出现数据发送事件。',
    completion: '实际观察连接建立、数据到达和连接释放事件。',
  },
  {
    id: 'switch-message',
    title: '任务 2 · 报文交换',
    goal: '理解整份报文逐站存储转发。',
    steps: ['切换报文交换', '观察中间节点完整接收', '确认存储后才开始下一跳'],
    hint: '对照“收到、已存储、转发”三个事件的先后顺序。',
    completion: '观察至少两个中间节点的完整存储，并看到报文到达 B。',
  },
  {
    id: 'switch-four-packets',
    title: '任务 3 · 四分组传输',
    goal: '观察分组拆分、流水传输、乱序到达与重组。',
    steps: ['选择分组交换', '设置 1200 B 消息和 300 B 分组', '观察 P1—P4 到达和重组'],
    hint: '比较“到达顺序”和“编号重组”，两者可能不同。',
    completion: '四个分组均被实际观察到达接收端。',
  },
  {
    id: 'switch-link-change',
    title: '任务 4 · 链路变化',
    goal: '理解拥塞或故障如何影响排队、时延和选路。',
    steps: ['选择一条链路', '设置拥塞或故障', '重播并观察排队、改道或中断'],
    hint: '没有真实替代路径时，分组不能凭空到达。',
    completion: '注入链路变化，并观察到拥塞传输、改道、等待或中断之一。',
  },
];

export interface SignalTaskEvidence {
  bits: string;
  encoding: SignalEncodingMode;
  compare: boolean;
  observedBitIndexes: number[];
  challengeCorrect: boolean;
}

export function evaluateSignalTask(taskId: SignalTaskId, evidence: SignalTaskEvidence) {
  if (taskId === 'signal-nrz-10110') return evidence.bits === '10110' && evidence.encoding === 'nrz' && [0, 1, 2, 3, 4].every(index => evidence.observedBitIndexes.includes(index));
  if (taskId === 'signal-compare-ones') return evidence.bits === '111111' && evidence.compare && [0, 1, 2, 3, 4, 5].every(index => evidence.observedBitIndexes.includes(index));
  return evidence.challengeCorrect;
}

export interface SwitchingTaskEvidence {
  mode: SwitchingMode;
  unitCount: number;
  observedEventTypes: string[];
  observedStoredNodes: string[];
  observedArrivals: string[];
  observedPhenomena: string[];
  networkActions: NetworkAction[];
}

export function evaluateSwitchingTask(taskId: SwitchingTaskId, evidence: SwitchingTaskEvidence) {
  if (taskId === 'switch-circuit') return evidence.mode === 'circuit' && ['CIRCUIT_ESTABLISHED', 'UNIT_ARRIVED', 'CIRCUIT_RELEASED'].every(type => evidence.observedEventTypes.includes(type));
  if (taskId === 'switch-message') return evidence.mode === 'message' && new Set(evidence.observedStoredNodes).size >= 2 && evidence.observedArrivals.includes('M1');
  if (taskId === 'switch-four-packets') return evidence.mode === 'packet' && evidence.unitCount === 4 && ['P1', 'P2', 'P3', 'P4'].every(id => evidence.observedArrivals.includes(id));
  return evidence.mode === 'packet' && evidence.networkActions.some(action => action.status !== 'normal') && evidence.observedPhenomena.length > 0;
}

export function buildExperimentRecord(input: Omit<ExperimentRecord, 'schemaVersion' | 'exportedAt' | 'privacy'>): ExperimentRecord {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    privacy: '记录仅在浏览器本地生成，不包含姓名、学号或其他真实身份信息，也不会上传外部服务。',
    ...input,
  };
}

export function downloadExperimentRecord(record: ExperimentRecord, filename: string) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
