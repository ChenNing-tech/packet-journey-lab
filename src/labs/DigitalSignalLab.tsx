import { useEffect, useMemo, useRef, useState } from 'react';
import { Binary, BookOpen, CheckCircle2, EyeOff, RefreshCw, SlidersHorizontal, Waves } from 'lucide-react';
import ExperimentScaffold from './ExperimentScaffold';
import { encodeSignal, explainBit, generateChallenge, levelAt, sanitizeBinaryInput, type EncodedSignal, type SignalEncodingMode } from './signalEncoding';
import TeachingTaskPanel, { LearningModeSwitch } from './TeachingTaskPanel';
import { buildExperimentRecord, downloadExperimentRecord, evaluateSignalTask, SIGNAL_TASKS, type SignalTaskId } from './teachingTasks';
import { useTeachingSession } from './useTeachingSession';
import { usePreviewPlayback } from './usePreviewPlayback';

const PRESETS = ['10110', '111111', '010101', '000000'];
const BIT_WIDTH = 68;
const LEFT_GUTTER = 56;
const RIGHT_GUTTER = 28;

const MODES: Record<SignalEncodingMode, { name: string; short: string; summary: string; rule: string }> = {
  nrz: {
    name: 'NRZ-L 不归零编码',
    short: 'NRZ-L',
    summary: '1 使用高电平，0 使用低电平。每个比特时间内电平保持不变。',
    rule: '只有相邻比特不同，才会在位边界产生电平切换。连续相同比特不会提供新的时钟跳变。',
  },
  manchester: {
    name: '曼彻斯特编码',
    short: 'Manchester',
    summary: '1 在位中点由低跳高，0 在位中点由高跳低。',
    rule: '每个比特中点必须跳变。相邻比特的边界是否额外跳变，由前一位结束电平和后一位开始电平决定。',
  },
};

function createWavePath(signal: EncodedSignal, highY: number, lowY: number) {
  const y = (level: 'high' | 'low') => level === 'high' ? highY : lowY;
  return signal.units.map((unit, index) => {
    const start = LEFT_GUTTER + index * BIT_WIDTH;
    const middle = start + BIT_WIDTH / 2;
    const end = start + BIT_WIDTH;
    const firstY = y(unit.firstLevel);
    const secondY = y(unit.secondLevel);
    return `${index === 0 ? `M ${start} ${firstY}` : `L ${start} ${firstY}`} L ${middle} ${firstY} L ${middle} ${secondY} L ${end} ${secondY}`;
  }).join(' ');
}

function WaveformPlot({ signal, activeBit, cursorProgress, label, compact = false }: { signal: EncodedSignal; activeBit: number; cursorProgress: number; label: string; compact?: boolean }) {
  const height = compact ? 142 : 184;
  const highY = compact ? 43 : 54;
  const lowY = compact ? 93 : 116;
  const axisY = compact ? 120 : 151;
  const endX = LEFT_GUTTER + signal.units.length * BIT_WIDTH;
  const cursorX = LEFT_GUTTER + Math.min(signal.units.length, Math.max(0, cursorProgress)) * BIT_WIDTH;
  const levels = signal.units.map(unit => signal.mode === 'nrz' ? unit.firstLevel : `${unit.firstLevel}-${unit.secondLevel}`).join(',');
  const middleTransitions = signal.units.filter(unit => unit.middleTransition).length;

  return <section className="waveform-row" aria-label={`${label}波形`}>
    <div className="waveform-row-label"><strong>{label}</strong><small>{signal.mode === 'nrz' ? '1=高，0=低' : '1=低→高，0=高→低'}</small></div>
    <svg width={endX + RIGHT_GUTTER} height={height} viewBox={`0 0 ${endX + RIGHT_GUTTER} ${height}`} role="img" aria-label={`${label}波形图`} data-testid={`waveform-${signal.mode}`} data-levels={levels} data-middle-transitions={middleTransitions}>
      <defs><marker id={`time-arrow-${signal.mode}-${compact ? 'compact' : 'full'}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7z" fill="#7E91A8"/></marker></defs>
      <rect x={LEFT_GUTTER + activeBit * BIT_WIDTH} y="25" width={BIT_WIDTH} height={lowY - 10} rx="4" className="active-bit-window"/>
      {signal.units.map((unit, index) => {
        const boundaryX = LEFT_GUTTER + index * BIT_WIDTH;
        const middleX = boundaryX + BIT_WIDTH / 2;
        return <g key={unit.index}>
          <line x1={boundaryX} x2={boundaryX} y1="24" y2={axisY - 8} className="bit-boundary"/>
          <line x1={middleX} x2={middleX} y1="31" y2={axisY - 8} className="bit-middle"/>
          <text x={boundaryX} y={axisY + 17} textAnchor="middle">t{index}</text>
        </g>;
      })}
      <line x1={endX} x2={endX} y1="24" y2={axisY - 8} className="bit-boundary"/>
      <text x={endX} y={axisY + 17} textAnchor="middle">t{signal.units.length}</text>
      <line x1={LEFT_GUTTER - 10} x2={endX + 13} y1={highY} y2={highY} className="signal-level-line"/>
      <line x1={LEFT_GUTTER - 10} x2={endX + 13} y1={lowY} y2={lowY} className="signal-level-line"/>
      <text x={LEFT_GUTTER - 19} y={highY + 4} textAnchor="end">高</text>
      <text x={LEFT_GUTTER - 19} y={lowY + 4} textAnchor="end">低</text>
      <path d={createWavePath(signal, highY, lowY)} className={`algorithm-wave wave-${signal.mode}`}/>
      <line x1={cursorX} x2={cursorX} y1="22" y2={axisY - 7} className="signal-cursor"/>
      <line x1={LEFT_GUTTER} x2={endX + 14} y1={axisY} y2={axisY} className="time-axis" markerEnd={`url(#time-arrow-${signal.mode}-${compact ? 'compact' : 'full'})`}/>
      <text x={endX + 18} y={axisY + 4} className="time-label">时间</text>
    </svg>
  </section>;
}

export default function DigitalSignalLab() {
  const [mode, setMode] = useState<SignalEncodingMode>('nrz');
  const [bits, setBits] = useState('10110');
  const [compare, setCompare] = useState(false);
  const [labMode, setLabMode] = useState<'observe' | 'challenge'>('observe');
  const [challengeBits, setChallengeBits] = useState('10110');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeChecked, setChallengeChecked] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const teaching = useTeachingSession<SignalTaskId>('signal-nrz-10110');
  const [observedBits, setObservedBits] = useState<Record<SignalTaskId, number[]>>({
    'signal-nrz-10110': [],
    'signal-compare-ones': [],
    'signal-decode': [],
  });
  const [autoStartTask, setAutoStartTask] = useState<SignalTaskId | null>(null);
  const [demoCheckpoint, setDemoCheckpoint] = useState('准备好后点击“开始引导演示”。');
  const lastCheckpoint = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sequence = labMode === 'challenge' ? challengeBits : bits;
  const steps = useMemo(() => sequence.length ? sequence.split('').map((_, index) => `观察第 ${index + 1} 个比特`) : ['等待输入'], [sequence]);
  const playback = usePreviewPlayback(steps.length);
  const activeBit = sequence.length ? Math.min(sequence.length - 1, playback.step) : 0;
  const signal = useMemo(() => encodeSignal(sequence, mode), [sequence, mode]);
  const nrzSignal = useMemo(() => encodeSignal(sequence, 'nrz'), [sequence]);
  const manchesterSignal = useMemo(() => encodeSignal(sequence, 'manchester'), [sequence]);
  const current = explainBit(signal, activeBit, playback.progress);
  const currentLevel = levelAt(signal, activeBit, playback.progress);
  const trackWidth = LEFT_GUTTER + sequence.length * BIT_WIDTH + RIGHT_GUTTER;
  const cursorProgress = activeBit + playback.progress;
  const challengeCorrect = challengeChecked && challengeAnswer === challengeBits;

  useEffect(() => {
    teaching.recordAction('实验配置', '编码参数已更新', { labMode, bits: sequence, encoding: mode, compare });
  }, [labMode, sequence, mode, compare, teaching.recordAction]);

  useEffect(() => {
    if (!sequence.length) return;
    const key = [labMode, sequence, mode, compare, activeBit, challengeChecked].join(':');
    const explanation = labMode === 'challenge' && !challengeChecked
      ? '观察隐藏波形第 ' + (activeBit + 1) + ' 位，尚未判题。'
      : (compare ? '同轴对比第 ' + (activeBit + 1) + ' 位：NRZ-L 位内保持电平；曼彻斯特中点跳变。' : explainBit(signal, activeBit, 0).explanation);
    teaching.recordObservation(key, explanation);
  }, [labMode, sequence, mode, compare, activeBit, challengeChecked, signal, teaching.recordObservation]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const left = LEFT_GUTTER + activeBit * BIT_WIDTH;
    const target = Math.max(0, left - viewport.clientWidth / 2 + BIT_WIDTH / 2);
    viewport.scrollTo({ left: target, behavior: playback.playing ? 'auto' : 'smooth' });
  }, [activeBit, playback.playing]);

  useEffect(() => {
    const taskId = teaching.activeTaskId;
    const matches = labMode === 'observe' && (
      (taskId === 'signal-nrz-10110' && bits === '10110' && mode === 'nrz')
      || (taskId === 'signal-compare-ones' && bits === '111111' && compare)
    );
    if (!matches) return;
    setObservedBits(current => current[taskId].includes(activeBit)
      ? current
      : { ...current, [taskId]: [...current[taskId], activeBit].sort((a, b) => a - b) });
  }, [activeBit, bits, compare, labMode, mode, teaching.activeTaskId]);

  useEffect(() => {
    for (const task of SIGNAL_TASKS) {
      if (evaluateSignalTask(task.id, {
        bits,
        encoding: mode,
        compare,
        observedBitIndexes: observedBits[task.id],
        challengeCorrect,
      })) teaching.markTaskComplete(task.id, { bits, encoding: mode, compare, labMode });
    }
  }, [bits, challengeCorrect, compare, mode, labMode, observedBits, teaching.markTaskComplete]);

  useEffect(() => {
    if (!autoStartTask) return;
    const ready = autoStartTask === 'signal-nrz-10110'
      ? labMode === 'observe' && bits === '10110' && mode === 'nrz'
      : autoStartTask === 'signal-compare-ones'
        ? labMode === 'observe' && bits === '111111' && compare
        : labMode === 'challenge';
    if (!ready) return;
    setAutoStartTask(null);
    if (autoStartTask !== 'signal-decode') playback.play();
  }, [autoStartTask, bits, compare, labMode, mode, playback]);

  useEffect(() => {
    if (teaching.learningMode !== 'demo' || !playback.playing) return;
    if (labMode !== 'observe') return;
    if (teaching.activeTaskId === 'signal-nrz-10110' && (bits !== '10110' || mode !== 'nrz')) return;
    if (teaching.activeTaskId === 'signal-compare-ones' && (bits !== '111111' || !compare)) return;
    const checkpoints = teaching.activeTaskId === 'signal-nrz-10110' ? [1, 3, 4]
      : teaching.activeTaskId === 'signal-compare-ones' ? [1, 5] : [];
    if (!checkpoints.includes(activeBit)) return;
    const key = teaching.activeTaskId + ':' + activeBit;
    if (lastCheckpoint.current === key) return;
    lastCheckpoint.current = key;
    playback.pause();
    setDemoCheckpoint(teaching.activeTaskId === 'signal-nrz-10110' && activeBit === 3
      ? '关键观察：连续两个 1 之间，NRZ-L 没有发生边界跳变。'
      : teaching.activeTaskId === 'signal-compare-ones'
        ? '关键观察：NRZ-L 保持高电平，曼彻斯特仍在每一位中点跳变。'
        : '已暂停在关键位区间。阅读右侧解释后继续播放。');
  }, [activeBit, bits, mode, compare, labMode, playback, playback.playing, teaching.activeTaskId, teaching.learningMode]);

  const resetForChange = () => {
    playback.reset();
    setAutoStartTask(null);
    lastCheckpoint.current = '';
    setChallengeChecked(false);
    setChallengeError('');
  };
  const updateBits = (value: string) => {
    const next = sanitizeBinaryInput(value);
    setBits(next);
    teaching.recordAction('修改二进制输入', next || '空');
    resetForChange();
  };
  const changeMode = (nextMode: SignalEncodingMode) => {
    setMode(nextMode);
    teaching.recordAction('切换编码', MODES[nextMode].short);
    playback.reset();
    setAutoStartTask(null);
    lastCheckpoint.current = '';
  };
  const changeLabMode = (nextMode: 'observe' | 'challenge') => {
    setLabMode(nextMode);
    setCompare(false);
    setChallengeAnswer('');
    setChallengeChecked(false);
    setChallengeError('');
    teaching.recordAction('切换实验内容', nextMode === 'observe' ? '编码观察' : '波形解码');
    playback.reset();
    setAutoStartTask(null);
    lastCheckpoint.current = '';
  };
  const checkChallenge = () => {
    if (challengeAnswer.length !== challengeBits.length) {
      setChallengeError(`请输入 ${challengeBits.length} 位答案后再检查。`);
      return;
    }
    setChallengeChecked(true);
    setChallengeError('');
    playback.pause();
    teaching.recordAction('提交解码答案', challengeAnswer === challengeBits ? '全部正确' : '存在错误');
    teaching.recordObservation('challenge:' + challengeBits + ':' + challengeAnswer, '解码提交：' + challengeAnswer + '；正确序列：' + challengeBits + '；' + (challengeAnswer === challengeBits ? '全部正确' : '仍有错误'));
  };
  const retryChallenge = () => {
    setChallengeAnswer('');
    setChallengeChecked(false);
    setChallengeError('');
    setAutoStartTask(null);
    playback.reset();
    teaching.recordAction('再次尝试解码', '清空当前答案');
  };
  const nextChallenge = () => {
    setChallengeBits(previous => generateChallenge(previous));
    setChallengeAnswer('');
    setChallengeChecked(false);
    setChallengeError('');
    playback.reset();
    teaching.recordAction('重新生成解码题', '生成新的本地随机序列');
  };

  const startTeachingTask = () => {
    const taskId = teaching.activeTaskId;
    lastCheckpoint.current = '';
    setDemoCheckpoint(teaching.learningMode === 'demo' ? '引导已开始；系统会在关键步骤自动暂停。' : '任务参数已加载，可播放或逐位观察。');
    setObservedBits(current => ({ ...current, [taskId]: taskId === 'signal-decode' ? [] : [0] }));
    setChallengeAnswer('');
    setChallengeChecked(false);
    setChallengeError('');
    playback.reset();
    if (taskId === 'signal-nrz-10110') {
      setLabMode('observe');
      setBits('10110');
      setMode('nrz');
      setCompare(false);
    } else if (taskId === 'signal-compare-ones') {
      setLabMode('observe');
      setBits('111111');
      setMode('nrz');
      setCompare(true);
    } else {
      setLabMode('challenge');
      setMode('manchester');
      setCompare(false);
      setChallengeBits(previous => generateChallenge(previous));
    }
    teaching.recordAction('开始教学任务', taskId);
    if (teaching.learningMode === 'demo') setAutoStartTask(taskId);
  };

  const resetTeachingExperiment = () => {
    playback.reset();
    teaching.resetSession();
    setObservedBits({ 'signal-nrz-10110': [], 'signal-compare-ones': [], 'signal-decode': [] });
    setLabMode('observe');
    setBits('10110');
    setMode('nrz');
    setCompare(false);
    setChallengeAnswer('');
    setChallengeChecked(false);
    setChallengeError('');
    setAutoStartTask(null);
    setDemoCheckpoint('实验记录已清空，可以重新开始。');
    lastCheckpoint.current = '';
  };

  const exportTeachingRecord = () => {
    const record = buildExperimentRecord({
      laboratory: '数字信号编码实验室',
      startedAt: teaching.startedAt,
      learningMode: teaching.learningMode,
      configuration: { labMode, bits: sequence, encoding: mode, compare, speed: playback.speed },
      actions: teaching.actions,
      observations: [...teaching.observations, ...SIGNAL_TASKS.flatMap(task => observedBits[task.id].map(index => task.id + '：已观察第 ' + (index + 1) + ' 位'))],
      tasks: SIGNAL_TASKS.map(task => ({ id: task.id, title: task.title, status: teaching.completedTaskIds.includes(task.id) ? 'completed' as const : 'incomplete' as const })),
    });
    downloadExperimentRecord(record, 'signal-encoding-record-' + new Date().toISOString().slice(0, 10) + '.json');
    teaching.recordAction('导出实验记录', '本地 JSON 文件');
  };

  const activeObserved = observedBits[teaching.activeTaskId].length;
  const taskFeedback = teaching.activeTaskId === 'signal-nrz-10110'
    ? '已观察 ' + activeObserved + '/5 个位区间。' + (demoCheckpoint ? ' ' + demoCheckpoint : '')
    : teaching.activeTaskId === 'signal-compare-ones'
      ? '已观察 ' + activeObserved + '/6 个对比区间。' + (demoCheckpoint ? ' ' + demoCheckpoint : '')
      : challengeChecked
        ? challengeCorrect ? '解码结果正确。' : '答案仍有错误，可根据逐位提示再次尝试。'
        : '进入波形解码并提交完整答案。';

  const modeBar = <div className="learning-modebar-layout">
    <div className="learning-mode-intro"><BookOpen size={15}/><span><strong>选择学习方式</strong><small>演示模式提供节奏引导，自由探索保留全部实验控制。</small></span></div>
    <LearningModeSwitch mode={teaching.learningMode} onChange={nextMode => {
      playback.pause();
      setAutoStartTask(null);
      setDemoCheckpoint(nextMode === 'demo' ? '演示模式会在关键步骤自动暂停。' : '可自由修改参数并使用全部播放控制。');
      teaching.setLearningMode(nextMode);
    }}/>
  </div>;

  const left = <>
    <div className="concept-panel-title"><SlidersHorizontal size={17}/><div><h2>实验参数</h2><p>输入序列并选择编码规则</p></div></div>
    <TeachingTaskPanel tasks={SIGNAL_TASKS} activeTaskId={teaching.activeTaskId} completedTaskIds={teaching.completedTaskIds} learningMode={teaching.learningMode} feedback={taskFeedback} onSelect={taskId => { playback.reset(); setAutoStartTask(null); lastCheckpoint.current = ''; teaching.setActiveTaskId(taskId); }} onStart={startTeachingTask} onReset={resetTeachingExperiment} onExport={exportTeachingRecord}/>
    <div className="signal-mode-tabs" role="tablist" aria-label="数字编码实验模式">
      <button role="tab" aria-selected={labMode === 'observe'} onClick={() => changeLabMode('observe')}>编码观察</button>
      <button role="tab" aria-selected={labMode === 'challenge'} onClick={() => changeLabMode('challenge')}>波形解码</button>
    </div>
    <fieldset className="concept-fieldset signal-encoding-options"><legend>编码方式</legend>{(Object.keys(MODES) as SignalEncodingMode[]).map(id => <label className="concept-radio" key={id}><input type="radio" name="encoding" checked={mode === id} onChange={() => changeMode(id)}/><span><strong>{MODES[id].short}</strong><small>{MODES[id].name}</small></span></label>)}</fieldset>
    {labMode === 'observe' ? <>
      <label className="concept-input"><span>二进制序列 <strong>{bits.length}/32</strong></span><input aria-label="二进制序列" value={bits} inputMode="numeric" maxLength={32} placeholder="输入 1—32 位 0 或 1" onChange={event => updateBits(event.target.value)} onBlur={() => { if (!bits) updateBits('1'); }}/><small>{bits ? '输入改变后，波形和播放位置会立即重算。' : '请输入至少 1 位二进制数据。'}</small></label>
      <div className="preset-row"><span>预设序列</span>{PRESETS.map(value => <button key={value} onClick={() => updateBits(value)}>{value}</button>)}</div>
      <label className="compare-toggle"><input type="checkbox" checked={compare} onChange={event => { setCompare(event.target.checked); teaching.recordAction('切换双编码对比', event.target.checked ? '开启' : '关闭'); playback.reset(); }}/><span><strong>双编码对比</strong><small>在同一时间轴上下对齐 NRZ-L 与曼彻斯特波形</small></span></label>
    </> : <section className="challenge-controls" aria-label="波形解码挑战">
      <div className="challenge-title"><EyeOff size={16}/><span><strong>原始比特已隐藏</strong><small>观察波形并输入 {challengeBits.length} 位答案</small></span></div>
      <label className="concept-input"><span>你的答案 <strong>{challengeAnswer.length}/{challengeBits.length}</strong></span><input aria-label="解码答案" value={challengeAnswer} disabled={challengeChecked} inputMode="numeric" maxLength={challengeBits.length} placeholder={'?'.repeat(challengeBits.length)} onChange={event => { setChallengeAnswer(sanitizeBinaryInput(event.target.value, challengeBits.length)); setChallengeError(''); }}/></label>
      {challengeError && <p className="challenge-error" role="alert">{challengeError}</p>}
      {challengeChecked && <div className={`challenge-summary ${challengeCorrect ? 'correct' : 'incorrect'}`} role="status"><strong>{challengeCorrect ? '全部正确' : '还有比特需要修正'}</strong><span>{challengeCorrect ? '你已经正确还原了整段波形。' : '红色单元格表示答案与波形不一致，可查看右侧逐位解释。'}</span></div>}
      <div className="challenge-actions">
        {!challengeChecked ? <button className="challenge-primary" onClick={checkChallenge}>检查答案</button> : <button className="challenge-primary" onClick={retryChallenge}>再次尝试</button>}
        <button onClick={nextChallenge}><RefreshCw size={13}/>重新出题</button>
      </div>
    </section>}
  </>;

  const displayedBit = (index: number) => {
    if (labMode === 'observe') return sequence[index];
    if (!challengeChecked) return '?';
    return challengeAnswer[index] ?? '–';
  };
  const bitResult = (index: number) => challengeChecked ? challengeAnswer[index] === challengeBits[index] ? 'correct' : 'incorrect' : '';

  const canvas = <>
    <div className="concept-canvas-heading"><div><Waves size={18}/><span><strong>{compare ? '双编码同步对比' : '编码波形'}</strong><small>{labMode === 'challenge' ? `解码挑战 · ${MODES[mode].name}` : MODES[mode].name}</small></span></div><span className="live-chip"><i/>bit {activeBit + 1} / {Math.max(1, sequence.length)}</span></div>
    <div className="signal-stage signal-lab-stage">
      <div className="wave-scroll" ref={scrollRef}>
        <div className="encoding-track" style={{ width: Math.max(500, trackWidth) }}>
          <div className="interactive-bit-strip" aria-label={labMode === 'challenge' ? '待解码比特' : `输入比特 ${sequence}`} style={{ marginLeft: LEFT_GUTTER, width: sequence.length * BIT_WIDTH }}>
            {sequence.split('').map((bit, index) => <button key={`${bit}-${index}`} className={`${index === activeBit ? 'active' : ''} ${bitResult(index)}`} aria-label={`选择第 ${index + 1} 个比特`} aria-pressed={index === activeBit} onClick={() => { teaching.recordAction('选择比特', '第 ' + (index + 1) + ' 位'); playback.seek(index); }}><small>{index + 1}</small><strong>{displayedBit(index)}</strong></button>)}
          </div>
          {sequence.length ? compare && labMode === 'observe' ? <div className="comparison-plots">
            <WaveformPlot signal={nrzSignal} activeBit={activeBit} cursorProgress={cursorProgress} label="NRZ-L" compact/>
            <WaveformPlot signal={manchesterSignal} activeBit={activeBit} cursorProgress={cursorProgress} label="曼彻斯特" compact/>
          </div> : <WaveformPlot signal={signal} activeBit={activeBit} cursorProgress={cursorProgress} label={MODES[mode].short}/> : <div className="empty-signal"><Binary size={27}/><strong>等待二进制输入</strong><span>输入 1—32 位 0 或 1 后自动生成波形。</span></div>}
        </div>
      </div>
      <div className="signal-legend"><span><i className="legend-blue"/>算法生成波形</span><span><i className="legend-teal"/>连续时间指针</span><span><i className="legend-dashed"/>位边界</span><span><i className="legend-mid"/>位中点</span></div>
    </div>
  </>;

  const unit = signal.units[activeBit];
  const expectedVisible = labMode === 'observe' || challengeChecked;
  const right = <>
    <div className="concept-panel-title"><BookOpen size={17}/><div><h2>知识解释</h2><p>解释由当前编码结果实时生成</p></div></div>
    <section className="knowledge-card accent-blue"><span><Binary size={17}/></span><div><small>当前编码</small><h3>{MODES[mode].name}</h3><p>{MODES[mode].summary}</p></div></section>
    <section className="knowledge-section"><h3>编码规则</h3><p>{MODES[mode].rule}</p></section>
    <section className="knowledge-section"><h3>当前真实状态</h3><dl className="state-list"><div><dt>当前区间</dt><dd className="mono">t{activeBit} — t{activeBit + 1}</dd></div><div><dt>当前比特</dt><dd>{expectedVisible && unit ? unit.bit : '等待作答'}</dd></div><div><dt>信号状态</dt><dd>{currentLevel ? current.state : '等待输入'}</dd></div><div><dt>位内位置</dt><dd>{Math.round(playback.progress * 100)}%</dd></div></dl></section>
    <section className="live-explanation" aria-live="polite"><strong>变化解释</strong><p>{labMode === 'challenge' && !challengeChecked ? `观察第 ${activeBit + 1} 个时间区间的电平和中点跳变，判断该比特。` : current.explanation}</p>{labMode === 'challenge' && challengeChecked && unit && <span className={bitResult(activeBit)}>你的答案：{challengeAnswer[activeBit] ?? '未填写'}；正确比特：{unit.bit}</span>}</section>
    {compare && <div className="compare-note"><CheckCircle2 size={16}/><span><strong>同轴比较</strong>NRZ-L 每位只有一个稳定电平；曼彻斯特每位中点必有跳变。</span></div>}
  </>;

  return <ExperimentScaffold eyebrow="SIGNAL ENCODING LAB" title="数字信号编码实验室" description="输入二进制数据，观察比特如何变成严格对齐的 NRZ-L 与曼彻斯特波形。" badge={teaching.learningMode === 'demo' ? '教学演示' : '自由探索'} contextLabel={labMode === 'challenge' ? '波形解码' : compare ? '双编码对比' : MODES[mode].short} steps={steps} playback={playback} left={left} canvas={canvas} right={right} modeBar={modeBar} onOperation={teaching.recordAction} speeds={[0.5, 1, 2]} footnote="空格播放 / 暂停，方向键逐步观察；导出按钮保存本次本地记录。"/>;
}
