import { describe, expect, it, vi } from 'vitest';
import { buildExperimentRecord, evaluateSignalTask, evaluateSwitchingTask } from './teachingTasks';

describe('教学任务真实状态判定', () => {
  it('编码任务必须观察全部目标位，不能只加载参数或跳到末位', () => {
    const base = { bits: '10110', encoding: 'nrz' as const, compare: false, challengeCorrect: false };
    expect(evaluateSignalTask('signal-nrz-10110', { ...base, observedBitIndexes: [4] })).toBe(false);
    expect(evaluateSignalTask('signal-nrz-10110', { ...base, observedBitIndexes: [0, 1, 2, 3, 4] })).toBe(true);
  });

  it('比较任务和解码任务分别依赖完整观察与真实判题', () => {
    expect(evaluateSignalTask('signal-compare-ones', { bits: '111111', encoding: 'nrz', compare: true, observedBitIndexes: [0, 1, 2, 3, 4, 5], challengeCorrect: false })).toBe(true);
    expect(evaluateSignalTask('signal-decode', { bits: '', encoding: 'manchester', compare: false, observedBitIndexes: [], challengeCorrect: false })).toBe(false);
    expect(evaluateSignalTask('signal-decode', { bits: '', encoding: 'manchester', compare: false, observedBitIndexes: [], challengeCorrect: true })).toBe(true);
  });

  it('电路任务必须真实观察建立、到达和释放三个关键事件', () => {
    const base = { mode: 'circuit' as const, unitCount: 1, observedStoredNodes: [], observedArrivals: [], observedPhenomena: [], networkActions: [] };
    expect(evaluateSwitchingTask('switch-circuit', { ...base, observedEventTypes: ['CIRCUIT_RELEASED'] })).toBe(false);
    expect(evaluateSwitchingTask('switch-circuit', { ...base, observedEventTypes: ['CIRCUIT_ESTABLISHED', 'UNIT_ARRIVED', 'CIRCUIT_RELEASED'] })).toBe(true);
  });

  it('报文、四分组和链路变化任务需要对应仿真证据', () => {
    expect(evaluateSwitchingTask('switch-message', { mode: 'message', unitCount: 1, observedEventTypes: [], observedStoredNodes: ['R1', 'R3'], observedArrivals: ['M1'], observedPhenomena: [], networkActions: [] })).toBe(true);
    expect(evaluateSwitchingTask('switch-four-packets', { mode: 'packet', unitCount: 4, observedEventTypes: [], observedStoredNodes: [], observedArrivals: ['P1', 'P2', 'P3'], observedPhenomena: [], networkActions: [] })).toBe(false);
    expect(evaluateSwitchingTask('switch-link-change', { mode: 'packet', unitCount: 3, observedEventTypes: [], observedStoredNodes: [], observedArrivals: [], observedPhenomena: ['REROUTE'], networkActions: [{ timeMs: 0, linkId: 'R1-R3', status: 'failed' }] })).toBe(true);
  });

  it('实验记录不包含用户身份值并标明仅本地生成', () => {
    vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
    const record = buildExperimentRecord({ laboratory: '数字信号编码实验室', startedAt: '2026-10-12T07:00:00Z', learningMode: 'demo', configuration: { bits: '10110' }, actions: [], observations: [], tasks: [] });
    expect(record.schemaVersion).toBe(1);
    expect(record.privacy).toContain('不会上传');
    expect(Object.keys(record)).not.toContain('studentName');
    vi.useRealTimers();
  });
});
