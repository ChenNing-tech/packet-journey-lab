import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BookOpen, Cable, CheckCircle2, CircleOff, Clock3, Database, Gauge, GitBranch, ListTree, MessageSquareText, Network, RotateCcw, SlidersHorizontal, TrafficCone } from 'lucide-react';
import { DeviceGlyph } from '../components/DeviceIcon';
import ExperimentScaffold from './ExperimentScaffold';
import TeachingTaskPanel, { LearningModeSwitch } from './TeachingTaskPanel';
import { buildExperimentRecord, downloadExperimentRecord, evaluateSwitchingTask, SWITCHING_TASKS, type SwitchingTaskId } from './teachingTasks';
import { useTeachingSession } from './useTeachingSession';
import { usePreviewPlayback } from './usePreviewPlayback';
import {
  DEFAULT_SWITCHING_CONFIG,
  SWITCHING_LINKS,
  SWITCHING_NODES,
  deriveSwitchingSnapshot,
  linkStatusAt,
  simulateSwitching,
  type LinkStatus,
  type NetworkAction,
  type RoutingRule,
  type SwitchingEvent,
  type SwitchingMode,
  type SwitchingNodeId,
} from './switchingSimulation';

const MODES: Record<SwitchingMode, { name: string; label: string; summary: string; stages: string[] }> = {
  circuit: { name: '电路交换', label: 'Circuit switching', summary: '先建立并预留端到端通路，再传输数据，最后释放连接。', stages: ['建立连接', '传输数据', '释放连接'] },
  message: { name: '报文交换', label: 'Message switching', summary: '完整报文逐站接收、存储、排队，再转发到下一跳。', stages: ['生成报文', '存储转发', '接收完成'] },
  packet: { name: '分组交换', label: 'Packet switching', summary: '报文拆为带编号的分组，分组可并行走不同路径并在终点重组。', stages: ['拆分分组', '流水传输', '接收整理'] },
};

const STATUS_LABEL: Record<LinkStatus, string> = { normal: '正常', congested: '拥塞', failed: '故障' };
const CONNECTION_LABEL = { idle: '空闲', establishing: '正在建立', connected: '连接已建立', releasing: '正在释放', released: '已释放', broken: '连接中断' } as const;

interface SwitchingObservation {
  configurationKey: string;
  eventTypes: string[];
  storedNodes: string[];
  arrivals: string[];
  phenomena: string[];
}

const emptySwitchingObservations = (): Record<SwitchingTaskId, SwitchingObservation> => ({
  'switch-circuit': { configurationKey: '', eventTypes: [], storedNodes: [], arrivals: [], phenomena: [] },
  'switch-message': { configurationKey: '', eventTypes: [], storedNodes: [], arrivals: [], phenomena: [] },
  'switch-four-packets': { configurationKey: '', eventTypes: [], storedNodes: [], arrivals: [], phenomena: [] },
  'switch-link-change': { configurationKey: '', eventTypes: [], storedNodes: [], arrivals: [], phenomena: [] },
});

function nodeById(id?: SwitchingNodeId) {
  return SWITCHING_NODES.find(node => node.id === id);
}

function inFlightPosition(unitId: string, events: SwitchingEvent[], timeMs: number) {
  const sends = events.filter(event => event.unitId === unitId && event.type === 'LINK_SEND' && event.timeMs <= timeMs);
  const send = sends.at(-1);
  if (!send?.from || !send.to) return null;
  const receive = events.find(event => event.unitId === unitId && event.type === 'NODE_RECEIVE' && event.from === send.from && event.to === send.to && event.timeMs >= send.timeMs);
  if (!receive || timeMs > receive.timeMs) return null;
  const from = nodeById(send.from)!;
  const to = nodeById(send.to)!;
  const progress = Math.max(0, Math.min(1, (timeMs - send.timeMs) / Math.max(.001, receive.timeMs - send.timeMs)));
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

export default function DataSwitchingLab() {
  const [mode, setMode] = useState<SwitchingMode>('packet');
  const [message, setMessage] = useState('HELLO NETWORK');
  const [messageBytes, setMessageBytes] = useState(1200);
  const [packetSizeBytes, setPacketSizeBytes] = useState(400);
  const [linkRateMbps, setLinkRateMbps] = useState(1);
  const [propagationDelayMs, setPropagationDelayMs] = useState(40);
  const [queueDelayMs, setQueueDelayMs] = useState(35);
  const [routingRule, setRoutingRule] = useState<RoutingRule>('load-balance');
  const [networkActions, setNetworkActions] = useState<NetworkAction[]>([]);
  const [selectedLink, setSelectedLink] = useState('R1-R3');
  const teaching = useTeachingSession<SwitchingTaskId>('switch-circuit');
  const [observations, setObservations] = useState<Record<SwitchingTaskId, SwitchingObservation>>(emptySwitchingObservations);
  const [autoStartTask, setAutoStartTask] = useState<SwitchingTaskId | null>(null);
  const [demoCheckpoint, setDemoCheckpoint] = useState('准备好后点击“开始引导演示”。');

  const config = useMemo(() => ({ ...DEFAULT_SWITCHING_CONFIG, mode, message, messageBytes, packetSizeBytes, linkRateMbps, propagationDelayMs, queueDelayMs, routingRule, networkActions }), [mode, message, messageBytes, packetSizeBytes, linkRateMbps, propagationDelayMs, queueDelayMs, routingRule, networkActions]);
  const configurationKey = JSON.stringify(config);
  const result = useMemo(() => simulateSwitching(config), [config]);
  const steps = useMemo(() => result.events.map(event => event.label), [result]);
  const playback = usePreviewPlayback(steps.length);
  const currentEvent = result.events[playback.step] ?? result.events[0];
  const nextEvent = result.events[Math.min(result.events.length - 1, playback.step + 1)] ?? currentEvent;
  const visualTime = currentEvent.timeMs + (nextEvent.timeMs - currentEvent.timeMs) * playback.progress;
  const snapshot = useMemo(() => deriveSwitchingSnapshot(result.events, playback.step), [result.events, playback.step]);
  const detail = MODES[mode];
  const selectedStatus = linkStatusAt(selectedLink, visualTime, networkActions);
  const packetCount = result.units.length;
  const reachedEnd = playback.step === result.events.length - 1;
  const isOutOfOrder = mode === 'packet' && result.arrivalOrder.join(',') !== result.reassembledOrder.join(',');

  useEffect(() => {
    teaching.recordAction('实验配置', '交换参数已更新', { ...config });
  }, [config, teaching.recordAction]);

  useEffect(() => {
    teaching.recordObservation(configurationKey + ':' + currentEvent.id, currentEvent.timeMs.toFixed(1) + ' ms：' + currentEvent.label + '。' + currentEvent.description);
  }, [configurationKey, currentEvent, teaching.recordObservation]);

  useEffect(() => {
    const taskId = teaching.activeTaskId;
    const matches = taskId === 'switch-circuit' ? mode === 'circuit'
      : taskId === 'switch-message' ? mode === 'message'
        : taskId === 'switch-four-packets' ? mode === 'packet' && result.units.length === 4
          : mode === 'packet' && networkActions.some(action => action.status !== 'normal');
    if (!matches) return;
    const congestedSend = currentEvent.type === 'LINK_SEND' && currentEvent.linkId
      && linkStatusAt(currentEvent.linkId, currentEvent.timeMs, networkActions) === 'congested';
    const phenomenon = ['REROUTE', 'WAITING_FOR_ROUTE', 'BLOCKED'].includes(currentEvent.type)
      ? currentEvent.type : congestedSend ? 'CONGESTED_LINK_SEND' : '';
    setObservations(current => {
      const previous: SwitchingObservation = current[taskId].configurationKey === configurationKey
        ? current[taskId] : { configurationKey, eventTypes: [], storedNodes: [], arrivals: [], phenomena: [] };
      const eventTypes = previous.eventTypes.includes(currentEvent.type) ? previous.eventTypes : [...previous.eventTypes, currentEvent.type];
      const storedNodes = currentEvent.type === 'UNIT_STORED' && currentEvent.nodeId && !previous.storedNodes.includes(currentEvent.nodeId)
        ? [...previous.storedNodes, currentEvent.nodeId] : previous.storedNodes;
      const arrivals = currentEvent.type === 'UNIT_ARRIVED' && currentEvent.unitId && !previous.arrivals.includes(currentEvent.unitId)
        ? [...previous.arrivals, currentEvent.unitId] : previous.arrivals;
      const phenomena = phenomenon && !previous.phenomena.includes(phenomenon) ? [...previous.phenomena, phenomenon] : previous.phenomena;
      if (eventTypes === previous.eventTypes && storedNodes === previous.storedNodes && arrivals === previous.arrivals && phenomena === previous.phenomena) return current;
      return { ...current, [taskId]: { configurationKey, eventTypes, storedNodes, arrivals, phenomena } };
    });
  }, [configurationKey, currentEvent, mode, networkActions, result.units.length, teaching.activeTaskId]);

  useEffect(() => {
    for (const task of SWITCHING_TASKS) {
      const observed = observations[task.id];
      if (observed.configurationKey !== configurationKey) continue;
      if (evaluateSwitchingTask(task.id, {
        mode,
        unitCount: result.units.length,
        observedEventTypes: observed.eventTypes,
        observedStoredNodes: observed.storedNodes,
        observedArrivals: observed.arrivals,
        observedPhenomena: observed.phenomena,
        networkActions,
      })) teaching.markTaskComplete(task.id, { ...config });
    }
  }, [configurationKey, config, mode, networkActions, observations, result.units.length, teaching.markTaskComplete]);

  useEffect(() => {
    if (!autoStartTask) return;
    const ready = autoStartTask === 'switch-circuit' ? mode === 'circuit'
      : autoStartTask === 'switch-message' ? mode === 'message'
        : autoStartTask === 'switch-four-packets' ? mode === 'packet' && result.units.length === 4
          : mode === 'packet' && networkActions.some(action => action.status !== 'normal');
    if (!ready) return;
    setAutoStartTask(null);
    playback.play();
  }, [autoStartTask, mode, networkActions, playback, result.units.length]);

  useEffect(() => {
    if (teaching.learningMode !== 'demo') return;
    const isCheckpoint = teaching.activeTaskId === 'switch-circuit'
      ? ['CIRCUIT_ESTABLISHED', 'UNIT_ARRIVED', 'CIRCUIT_RELEASED'].includes(currentEvent.type)
      : teaching.activeTaskId === 'switch-message'
        ? currentEvent.type === 'UNIT_STORED' || currentEvent.type === 'UNIT_ARRIVED'
        : teaching.activeTaskId === 'switch-four-packets'
          ? (currentEvent.type === 'LINK_SEND' && currentEvent.unitId === 'P2') || (currentEvent.type === 'UNIT_ARRIVED' && ['P1', 'P4'].includes(currentEvent.unitId ?? ''))
          : ['REROUTE', 'UNIT_QUEUED', 'WAITING_FOR_ROUTE', 'BLOCKED'].includes(currentEvent.type);
    if (!isCheckpoint) return;
    setDemoCheckpoint('关键步骤：' + currentEvent.label + '。动画连续播放，可随时手动暂停查看。');
  }, [currentEvent, teaching.activeTaskId, teaching.learningMode]);

  const resetTimeline = () => playback.reset();
  const updateMode = (nextMode: SwitchingMode) => { resetTimeline(); setMode(nextMode); teaching.recordAction('切换交换方式', MODES[nextMode].name); };
  const updateNumber = (setter: (value: number) => void, value: number, label: string) => { resetTimeline(); setter(value); teaching.recordAction('修改实验参数', label + ' = ' + value); };
  const setLinkStatus = (status: LinkStatus) => {
    const timeMs = Number(visualTime.toFixed(3));
    resetTimeline();
    setNetworkActions(actions => [...actions.filter(action => !(action.linkId === selectedLink && action.timeMs === timeMs)), { timeMs, linkId: selectedLink, status }]);
    teaching.recordAction('修改链路状态', selectedLink + ' → ' + STATUS_LABEL[status] + '（' + timeMs + ' ms）');
  };

  const startTeachingTask = () => {
    const taskId = teaching.activeTaskId;
    playback.reset();
    setDemoCheckpoint(taskId === 'switch-link-change' ? '请在拓扑中选择链路，再设置拥塞或故障。' : teaching.learningMode === 'demo' ? '引导已开始，将连续播放至实验结束；可随时手动暂停。' : '任务参数已加载，可播放或逐事件观察。');
    setObservations(current => ({ ...current, [taskId]: { configurationKey: '', eventTypes: [], storedNodes: [], arrivals: [], phenomena: [] } }));
    setNetworkActions([]);
    if (taskId === 'switch-circuit') setMode('circuit');
    if (taskId === 'switch-message') setMode('message');
    if (taskId === 'switch-four-packets') {
      setMode('packet');
      setMessageBytes(1200);
      setPacketSizeBytes(300);
      setRoutingRule('load-balance');
    }
    if (taskId === 'switch-link-change') {
      setMode('packet');
      setMessageBytes(1200);
      setPacketSizeBytes(400);
      setRoutingRule('load-balance');
    }
    teaching.recordAction('开始教学任务', taskId);
    if (teaching.learningMode === 'demo') setAutoStartTask(taskId);
  };

  const resetTeachingExperiment = () => {
    playback.reset();
    teaching.resetSession();
    setObservations(emptySwitchingObservations());
    setMode('packet');
    setMessage('HELLO NETWORK');
    setMessageBytes(1200);
    setPacketSizeBytes(400);
    setLinkRateMbps(1);
    setPropagationDelayMs(40);
    setQueueDelayMs(35);
    setRoutingRule('load-balance');
    setNetworkActions([]);
    setSelectedLink('R1-R3');
    setAutoStartTask(null);
    setDemoCheckpoint('实验记录已清空，可以重新开始。');
  };

  const exportTeachingRecord = () => {
    const record = buildExperimentRecord({
      laboratory: '数据交换技术实验室',
      startedAt: teaching.startedAt,
      learningMode: teaching.learningMode,
      configuration: { mode, message, messageBytes, packetSizeBytes, linkRateMbps, propagationDelayMs, queueDelayMs, routingRule, networkActions, speed: playback.speed },
      actions: teaching.actions,
      observations: [...teaching.observations, ...SWITCHING_TASKS.flatMap(task => {
        const item = observations[task.id];
        return [...item.eventTypes.map(type => task.id + '：' + type), ...item.storedNodes.map(node => task.id + '：在 ' + node + ' 完整存储'), ...item.arrivals.map(unit => task.id + '：' + unit + ' 到达'), ...item.phenomena.map(value => task.id + '：观察到 ' + value)];
      })],
      tasks: SWITCHING_TASKS.map(task => ({ id: task.id, title: task.title, status: teaching.completedTaskIds.includes(task.id) ? 'completed' as const : 'incomplete' as const })),
    });
    downloadExperimentRecord(record, 'data-switching-record-' + new Date().toISOString().slice(0, 10) + '.json');
    teaching.recordAction('导出实验记录', '本地 JSON 文件');
  };

  const activeObservation = observations[teaching.activeTaskId];
  const stageIndex = currentEvent.type === 'SIMULATION_COMPLETE' ? 2 : mode === 'circuit'
    ? (currentEvent.phase === '释放连接' ? 2 : currentEvent.phase === '传输数据' ? 1 : 0)
    : ['NODE_RECEIVE', 'UNIT_ARRIVED'].includes(currentEvent.type) && currentEvent.nodeId === 'B' ? 2
      : ['SIMULATION_START', 'UNIT_CREATED'].includes(currentEvent.type) ? 0 : 1;
  const taskFeedback = teaching.activeTaskId === 'switch-circuit'
    ? '已观察 ' + ['CIRCUIT_ESTABLISHED', 'UNIT_ARRIVED', 'CIRCUIT_RELEASED'].filter(type => activeObservation.eventTypes.includes(type)).length + '/3 个关键事件。 ' + demoCheckpoint
    : teaching.activeTaskId === 'switch-message'
      ? '已观察 ' + new Set(activeObservation.storedNodes).size + '/2 个中间节点存储。 ' + demoCheckpoint
      : teaching.activeTaskId === 'switch-four-packets'
        ? '已观察 ' + activeObservation.arrivals.filter(id => /^P[1-4]$/.test(id)).length + '/4 个分组到达。 ' + demoCheckpoint
        : networkActions.some(action => action.status !== 'normal')
          ? '链路变化已注入；继续播放直到出现排队、改道、等待或中断。 ' + demoCheckpoint
          : '尚未设置拥塞或故障。 ' + demoCheckpoint;

  const modeBar = <div className="switch-modebar-layout">
    <div className="switch-modebar" role="tablist" aria-label="交换技术">
      {(Object.keys(MODES) as SwitchingMode[]).map((id, index) => <button key={id} role="tab" aria-selected={mode === id} onClick={() => updateMode(id)}><span>{index + 1}</span><strong>{MODES[id].name}</strong><small>{MODES[id].label}</small></button>)}
      <div className="switch-mode-summary"><Activity size={14}/><span>同一拓扑 · 同一数据</span></div>
    </div>
    <LearningModeSwitch mode={teaching.learningMode} demoDescription="连续播放至实验结束" onChange={nextMode => {
      playback.pause();
      setAutoStartTask(null);
      setDemoCheckpoint(nextMode === 'demo' ? '演示模式将连续播放至实验结束，可随时手动暂停。' : '可自由调整参数、链路和播放位置。');
      teaching.setLearningMode(nextMode);
    }}/>
  </div>;

  const left = <>
    <div className="concept-panel-title"><SlidersHorizontal size={17}/><div><h2>实验参数</h2><p>所有模式共用这些参数</p></div></div>
    <TeachingTaskPanel tasks={SWITCHING_TASKS} activeTaskId={teaching.activeTaskId} completedTaskIds={teaching.completedTaskIds} learningMode={teaching.learningMode} feedback={taskFeedback} onSelect={taskId => { playback.reset(); setAutoStartTask(null); teaching.setActiveTaskId(taskId); }} onStart={startTeachingTask} onReset={resetTeachingExperiment} onExport={exportTeachingRecord}/>
    <label className="switch-message-input"><span>消息内容</span><textarea aria-label="消息内容" maxLength={120} value={message} onChange={event => { resetTimeline(); setMessage(event.target.value); }} onBlur={() => teaching.recordAction('修改消息内容', message || '空')}/><small>内容用于标识载荷，数据量由下方参数统一计量。</small></label>
    <div className="switch-parameter-grid">
      <label><span>消息大小</span><select aria-label="消息大小" value={messageBytes} onChange={event => updateNumber(setMessageBytes, Number(event.target.value), '消息大小 B')}>{[600, 1200, 1800, 2400].map(value => <option key={value} value={value}>{value} B</option>)}</select></label>
      <label><span>分组载荷</span><select aria-label="分组大小" value={packetSizeBytes} disabled={mode !== 'packet'} onChange={event => updateNumber(setPacketSizeBytes, Number(event.target.value), '分组载荷 B')}>{[200, 300, 400, 600].map(value => <option key={value} value={value}>{value} B</option>)}</select></label>
      <label><span>链路速率</span><select aria-label="链路速率" value={linkRateMbps} onChange={event => updateNumber(setLinkRateMbps, Number(event.target.value), '链路速率 Mbps')}>{[.5, 1, 2, 10].map(value => <option key={value} value={value}>{value} Mbps</option>)}</select></label>
      <label><span>传播延迟</span><select aria-label="传播延迟" value={propagationDelayMs} onChange={event => updateNumber(setPropagationDelayMs, Number(event.target.value), '传播延迟 ms')}>{[20, 40, 60, 100].map(value => <option key={value} value={value}>{value} ms</option>)}</select></label>
      <label><span>节点排队</span><select aria-label="节点排队延迟" value={queueDelayMs} onChange={event => updateNumber(setQueueDelayMs, Number(event.target.value), '节点排队 ms')}>{[0, 20, 35, 60, 100].map(value => <option key={value} value={value}>{value} ms</option>)}</select></label>
      <label><span>选路规则</span><select aria-label="选路规则" value={routingRule} disabled={mode === 'circuit'} onChange={event => { resetTimeline(); setRoutingRule(event.target.value as RoutingRule); teaching.recordAction('修改选路规则', event.target.value); }}><option value="load-balance">分流演示</option><option value="lowest-delay">最低时延</option></select></label>
    </div>
    <div className="parameter-summary"><span><Database size={15}/>传输单元</span><strong>{mode === 'packet' ? `${packetCount} 个分组` : mode === 'message' ? '1 个完整报文' : '连续数据流'}</strong></div>
    <div className="switch-formula"><Gauge size={14}/><span>发送时延 = 数据位数 ÷ 链路速率<br/>每个分组额外包含 24 B 教学首部</span></div>
  </>;

  const canvas = <>
    <div className="concept-canvas-heading"><div><Network size={18}/><span><strong>交换网络仿真</strong><small>A 到 B 的两条真实可用路径</small></span></div><span className={`live-chip ${result.completed ? '' : 'warning'}`} data-testid="result-status"><i/>{reachedEnd ? (result.completed ? '仿真完成' : '传输中断') : `t = ${visualTime.toFixed(1)} ms`}</span></div>
    <div className="switch-stage-rail" aria-label="当前交换阶段">{detail.stages.map((stage, index) => <span key={stage} className={stageIndex === index ? 'active' : ''} aria-current={stageIndex === index ? 'step' : undefined}>{stage}</span>)}</div>
    <div className={`switching-stage simulation-stage mode-${mode}`}>
      <svg viewBox="0 0 760 450" role="img" aria-label={`${detail.name}事件驱动网络拓扑`}>
        <defs>
          <marker id="switch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#2563EB"/></marker>
          <filter id="unit-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#173B68" floodOpacity=".18"/></filter>
        </defs>
        {SWITCHING_LINKS.map(link => {
          const from = nodeById(link.from)!;
          const to = nodeById(link.to)!;
          const status = snapshot.linkStates[link.id] ?? 'normal';
          const active = currentEvent.linkId === link.id;
          const reserved = snapshot.reservedLinks.includes(link.id);
          const selected = selectedLink === link.id;
          return <g key={link.id} className={`sim-link status-${status} ${active ? 'active' : ''} ${reserved ? 'reserved' : ''} ${selected ? 'selected' : ''}`} data-testid={`link-${link.id}`} role="button" tabIndex={0} aria-label={`选择链路 ${link.id}，当前${STATUS_LABEL[status]}`} onClick={() => setSelectedLink(link.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedLink(link.id); }}>
            <line className="link-hit" x1={from.x} y1={from.y} x2={to.x} y2={to.y}/><line className="link-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={active ? 'url(#switch-arrow)' : undefined}/>
            <g transform={`translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`}><rect x="-29" y="-10" width="58" height="20" rx="6"/><text y="3" textAnchor="middle">{link.id}</text></g>
          </g>;
        })}
        {SWITCHING_NODES.map(node => <g key={node.id} className={`sim-node ${snapshot.nodeStates[node.id] ? 'busy' : ''} ${currentEvent.nodeId === node.id || currentEvent.from === node.id || currentEvent.to === node.id ? 'current-object' : ''}`} transform={`translate(${node.x} ${node.y})`}>
          <circle r="52" className="node-halo"/><g transform={`scale(${node.type === 'router' ? .72 : .66})`}><DeviceGlyph type={node.type}/></g>
          <text className="node-name" y="66" textAnchor="middle">{node.label}</text>
          <g className="node-state" transform="translate(0 78)"><rect x="-52" y="-10" width="104" height="20" rx="10"/><text y="3" textAnchor="middle">{snapshot.nodeStates[node.id] ?? '空闲'}</text></g>
        </g>)}
        {result.units.map((unit, index) => {
          const flying = inFlightPosition(unit.id, result.events, visualTime);
          const location = snapshot.unitLocations[unit.id];
          const node = location?.node ? nodeById(location.node) : undefined;
          if (!flying && !node) return null;
          const x = flying?.x ?? node!.x;
          const y = (flying?.y ?? node!.y) - 49 - index * 4;
          return <g key={unit.id} className="sim-data-unit" data-testid={`unit-${unit.id}`} transform={`translate(${x} ${y})`}><rect x="-22" y="-13" width="44" height="26" rx="7"/><text y="4" textAnchor="middle">{unit.id}</text></g>;
        })}
      </svg>
      <div className="switching-legend"><span><i className="legend-blue"/>正在传输</span><span><i className="legend-teal"/>已预留</span><span><i className="legend-gray"/>正常链路</span><span><i className="legend-congested"/>拥塞</span><span><i className="legend-failed"/>故障</span></div>
    </div>
  </>;

  const right = <>
    <div className="concept-panel-title"><BookOpen size={17}/><div><h2>状态与事件</h2><p>所有画面由仿真事件还原</p></div></div>
    <section className="knowledge-card accent-teal current-switch-event"><span><Clock3 size={17}/></span><div><small>{currentEvent.phase} · {currentEvent.timeMs.toFixed(1)} ms</small><h3>{currentEvent.label}</h3><p>{currentEvent.description}</p></div></section>
    <section className="knowledge-section switch-state-section"><h3>当前状态</h3><dl className="state-list"><div><dt>交换方式</dt><dd>{detail.name}</dd></div>{mode === 'circuit' && <div><dt>连接</dt><dd>{CONNECTION_LABEL[snapshot.connection]}</dd></div>}<div><dt>到达进度</dt><dd>{snapshot.arrivalOrder.length} / {packetCount}</dd></div><div><dt>仿真总时长</dt><dd className="mono">{result.durationMs.toFixed(1)} ms</dd></div></dl></section>
    <section className="link-console"><div className="link-console-heading"><Cable size={15}/><span><strong>链路控制台</strong><small>点击拓扑链路可切换目标</small></span><b className={`status-${selectedStatus}`}>{selectedLink} · {STATUS_LABEL[selectedStatus]}</b></div><div className="link-actions"><button onClick={() => setLinkStatus('normal')}><CheckCircle2 size={13}/>恢复</button><button onClick={() => setLinkStatus('congested')}><TrafficCone size={13}/>拥塞</button><button onClick={() => setLinkStatus('failed')}><CircleOff size={13}/>故障</button></div>{networkActions.length > 0 && <button className="clear-link-events" onClick={() => { resetTimeline(); setNetworkActions([]); teaching.recordAction('清除链路事件', '恢复默认链路状态'); }}><RotateCcw size={12}/>清除 {networkActions.length} 个链路事件</button>}</section>
    {mode === 'packet' && <section className="arrival-board"><h3><GitBranch size={14}/>接收与重组</h3><div><span>到达顺序</span><strong data-testid="arrival-order">{snapshot.arrivalOrder.join(' → ') || '等待分组'}</strong></div><div><span>编号重组</span><strong>{result.reassembledOrder.join(' → ')}</strong></div>{reachedEnd && isOutOfOrder && <p><AlertTriangle size={13}/>分组乱序到达，接收端已按编号恢复。</p>}</section>}
    <section className="event-log"><h3><ListTree size={14}/>事件日志 <small>{snapshot.logs.length}/{result.events.length}</small></h3><div>{snapshot.logs.slice(-9).reverse().map(event => <article key={event.id} className={event.id === currentEvent.id ? 'current' : ''}><time>{event.timeMs.toFixed(1)}</time><span><strong>{event.label}</strong><small>{event.unitId ? `${event.unitId} · ` : ''}{event.phase}</small></span></article>)}</div></section>
    <div className="concept-hint"><MessageSquareText size={16}/><span><strong>{detail.name}</strong>{detail.summary}</span></div>
  </>;

  return <ExperimentScaffold eyebrow="DATA SWITCHING LAB" title="数据交换技术实验室" description="在同一拓扑、同一数据和同一单位下，对比三种交换技术的真实事件过程。" badge={teaching.learningMode === 'demo' ? '教学演示' : '自由探索'} contextLabel={detail.name} steps={steps} playback={playback} left={left} canvas={canvas} right={right} modeBar={modeBar} onOperation={teaching.recordAction} speeds={[.5, 1, 2]} footnote="空格播放 / 暂停，方向键逐步观察；导出按钮保存本次本地记录。"/>;
}
