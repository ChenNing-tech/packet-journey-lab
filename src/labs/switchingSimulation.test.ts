import { describe, expect, it } from 'vitest';
import { DEFAULT_SWITCHING_CONFIG, deriveSwitchingSnapshot, simulateSwitching, type SwitchingConfig, type SwitchingMode } from './switchingSimulation';

const create = (mode: SwitchingMode, overrides: Partial<SwitchingConfig> = {}) => simulateSwitching({ ...DEFAULT_SWITCHING_CONFIG, mode, ...overrides });

describe('数据交换离散事件引擎', () => {
  it.each(['circuit', 'message', 'packet'] as SwitchingMode[])('%s 默认参数均能从 A 完成到 B 的传输', mode => {
    const result = create(mode);
    expect(result.completed).toBe(true);
    expect(result.arrivalOrder).toHaveLength(result.units.length);
    expect(new Set(result.arrivalOrder).size).toBe(result.units.length);
  });

  it('电路交换严格按建立、传输、释放三个阶段执行', () => {
    const result = create('circuit');
    const established = result.events.find(event => event.type === 'CIRCUIT_ESTABLISHED')!;
    const firstData = result.events.find(event => event.type === 'LINK_SEND')!;
    const arrived = result.events.find(event => event.type === 'UNIT_ARRIVED')!;
    const release = result.events.find(event => event.type === 'CIRCUIT_RELEASE_START')!;
    expect(firstData.timeMs).toBeGreaterThan(established.timeMs);
    expect(release.timeMs).toBeGreaterThan(arrived.timeMs);
    expect(result.events.filter(event => event.type === 'CIRCUIT_RESERVE')).toHaveLength(3);
  });

  it('报文交换在每个中间节点完整接收和存储后才开始下一跳', () => {
    const result = create('message');
    const path = result.events.find(event => event.type === 'UNIT_CREATED')!.path!;
    for (const node of path.slice(1, -1)) {
      const received = result.events.find(event => event.type === 'NODE_RECEIVE' && event.nodeId === node)!;
      const stored = result.events.find(event => event.type === 'UNIT_STORED' && event.nodeId === node)!;
      const forwarded = result.events.find(event => event.type === 'UNIT_FORWARD' && event.nodeId === node)!;
      expect(stored.timeMs).toBeGreaterThanOrEqual(received.timeMs);
      expect(forwarded.timeMs).toBeGreaterThan(stored.timeMs);
    }
  });

  it('分组交换拆分唯一编号、形成流水线并允许乱序到达后按编号整理', () => {
    const result = create('packet');
    expect(result.units.map(unit => unit.id)).toEqual(['P1', 'P2', 'P3']);
    const p2Starts = result.events.find(event => event.type === 'LINK_SEND' && event.unitId === 'P2')!;
    const p1Arrives = result.events.find(event => event.type === 'UNIT_ARRIVED' && event.unitId === 'P1')!;
    expect(p2Starts.timeMs).toBeLessThan(p1Arrives.timeMs);
    expect(result.arrivalOrder).not.toEqual(result.reassembledOrder);
    expect(result.reassembledOrder).toEqual(['P1', 'P2', 'P3']);
  });

  it('单条上方链路故障时只使用真实存在的下方替代路径', () => {
    const result = create('message', { networkActions: [{ timeMs: 0, linkId: 'R1-R3', status: 'failed' }] });
    expect(result.completed).toBe(true);
    expect(result.events.find(event => event.type === 'UNIT_CREATED')!.path).toEqual(['A', 'R2', 'R4', 'B']);
    expect(result.events.some(event => event.linkId === 'R1-R3' && event.type === 'LINK_SEND')).toBe(false);
  });

  it('两条起始链路均故障时不会跳过节点或伪造到达', () => {
    const result = create('packet', { networkActions: [{ timeMs: 0, linkId: 'A-R1', status: 'failed' }, { timeMs: 0, linkId: 'A-R2', status: 'failed' }] });
    expect(result.completed).toBe(false);
    expect(result.arrivalOrder).toEqual([]);
    expect(result.events.some(event => event.type === 'BLOCKED')).toBe(true);
  });

  it('中途故障后只有找到真实替代路径才生成重新选路事件', () => {
    const result = create('packet', { networkActions: [{ timeMs: 35, linkId: 'R1-R3', status: 'failed' }] });
    const reroute = result.events.find(event => event.type === 'REROUTE' && event.unitId === 'P1');
    expect(reroute?.path?.[0]).toBe('R1');
    expect(reroute?.path?.at(-1)).toBe('B');
    expect(result.completed).toBe(true);
  });

  it('无路时等待后续恢复事件，并在真实路径恢复后继续传输', () => {
    const result = create('packet', {
      networkActions: [
        { timeMs: 0, linkId: 'A-R1', status: 'failed' },
        { timeMs: 0, linkId: 'A-R2', status: 'failed' },
        { timeMs: 80, linkId: 'A-R2', status: 'normal' },
      ],
    });
    expect(result.events.some(event => event.type === 'WAITING_FOR_ROUTE')).toBe(true);
    expect(result.events.some(event => event.type === 'LINK_STATUS_CHANGE' && event.linkId === 'A-R2' && event.linkStatus === 'normal')).toBe(true);
    expect(result.completed).toBe(true);
  });

  it('拥塞会增加链路开销，快照能按事件确定性恢复状态', () => {
    const normal = create('message');
    const congested = create('message', { networkActions: [{ timeMs: 0, linkId: 'A-R1', status: 'congested' }] });
    expect(congested.durationMs).toBeGreaterThan(normal.durationMs);
    const actionIndex = congested.events.findIndex(event => event.type === 'LINK_STATUS_CHANGE');
    expect(deriveSwitchingSnapshot(congested.events, actionIndex).linkStates['A-R1']).toBe('congested');
    expect(simulateSwitching(congested.config).events).toEqual(congested.events);
  });
});
