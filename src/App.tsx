import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, Check, CircleHelp, Database, FlaskConical, Info, Layers, ListOrdered, Maximize2, Minimize2, Pause, Play, Repeat2, RotateCcw, ShieldAlert, SkipBack, SkipForward, X } from 'lucide-react';
import { advancePlayback, compileSnapshots, initialPlayback, type PlaybackAction } from './simulation/engine';
import { createScenario } from './simulation/scenarios';
import type { DeviceId, FaultId, ScenarioId } from './simulation/types';
import { ProtocolBadge } from './components/ProtocolBadge';
import TopologyView from './components/TopologyView';
import PacketInspector from './components/PacketInspector';
import DeviceInspector from './components/DeviceInspector';
import ScenarioSidebar from './components/ScenarioSidebar';


export default function App() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('lan-ping');
  const [fault, setFault] = useState<FaultId>('none');
  const scenario = useMemo(() => createScenario(scenarioId, fault), [scenarioId, fault]);
  const snapshots = useMemo(() => compileSnapshots(scenario), [scenario]);
  const [playback, setPlayback] = useState(initialPlayback);
  const [teacherVisible, setTeacherVisible] = useState(true);
  const [labels, setLabels] = useState(true);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [selected, setSelected] = useState<DeviceId>('SW1');
  const [deviceTab, setDeviceTab] = useState<'device' | 'address'>('device');
  const [helpVisible, setHelpVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const timelineCurrent = useRef<HTMLButtonElement>(null);
  const helpClose = useRef<HTMLButtonElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const event = scenario.events[Math.min(playback.index, scenario.events.length - 1)];
  const state = snapshots[event.index];
  const dispatch = useCallback((action: PlaybackAction) => setPlayback(previous => advancePlayback(previous, action, scenario.events)), [scenario]);

  useEffect(() => {
    if (!playback.playing) return;
    let frame = 0;
    let previous: number | undefined;
    const tick = (now: number) => {
      if (previous !== undefined) dispatch({ type: 'TICK', delta: Math.min(100, now - previous) });
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback.playing, dispatch]);

  useEffect(() => {
    if (timelineCurrent.current) { const button = timelineCurrent.current; const container = button.parentElement!; container.scrollTo({ left: Math.max(0, button.offsetLeft - container.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2), behavior: 'instant' }); }
  }, [event.id]);
  useEffect(() => { const listener = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', listener); return () => document.removeEventListener('fullscreenchange', listener); }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (helpVisible) { if (e.key === 'Escape') { setHelpVisible(false); helpTrigger.current?.focus(); } return; }
      if (e.key === 'Escape' && deviceOpen) { setDeviceOpen(false); return; }
      if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); dispatch({ type: playback.playing ? 'PAUSE' : 'PLAY' }); }
      if (e.key === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'NEXT' }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'PREVIOUS' }); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [dispatch, playback.playing, helpVisible, deviceOpen]);
  useEffect(() => { if (helpVisible) helpClose.current?.focus(); }, [helpVisible]);

  const changeScenario = (id: ScenarioId, nextFault: FaultId = 'none') => {
    setScenarioId(id); setFault(nextFault); setPlayback(previous => ({ ...initialPlayback, speed: previous.speed })); setSelected('SW1'); setDeviceTab('device'); setDeviceOpen(false);
  };
  const selectDevice = (id: DeviceId) => { dispatch({ type: 'PAUSE' }); setSelected(id); setDeviceTab('device'); setDeviceOpen(true); };
  const phases = scenario.events.reduce<{ name: string; index: number }[]>((list, item) => { if (!list.some(p => p.name === item.phase)) list.push({ name: item.phase, index: item.index }); return list; }, []);
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setNotice(''); }
    catch { setNotice('当前浏览器未允许全屏，可使用浏览器的 F11 全屏。'); }
  };
  const closeHelp = () => { setHelpVisible(false); helpTrigger.current?.focus(); };

  return <div className="app-shell">
    <header className="app-header compact-header">
      <div className="header-context">
        <div className="brand"><div><h1>数据包传输动画实验室</h1><p>PACKET JOURNEY LAB</p></div></div>
        <span className="header-scenario">{scenario.meta.title}</span>
        <div className="scenario-status" title={event.failure ? '故障已定位' : playback.playing ? '正在播放' : event.type === 'COMPLETE' ? '实验已完成' : '等待探索'}>
          <span className="visually-hidden">{event.failure ? '故障已定位' : playback.playing ? '正在播放' : event.type === 'COMPLETE' ? '实验已完成' : '等待探索'}</span>
          步骤 <strong data-testid="step-counter">{event.index + 1}<span> / {scenario.events.length}</span></strong>
        </div>
      </div>
      <section className="playback-bar panel" aria-label="播放控制">
        <div className="primary-controls">
          <button className={`play-button ${playback.playing ? 'is-playing' : ''}`} onClick={() => dispatch({ type: playback.playing ? 'PAUSE' : 'PLAY' })} disabled={Boolean(event.failure)}>{playback.playing ? <Pause size={15} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}{playback.playing ? '暂停' : '播放'}</button>
          <button className="control-button" title="上一步（←）" onClick={() => dispatch({ type: 'PREVIOUS' })} disabled={event.index === 0}><SkipBack size={14}/><span>上一步</span></button>
          <button className="control-button" title="下一步（→）" onClick={() => dispatch({ type: 'NEXT' })} disabled={event.index === scenario.events.length - 1}><span>下一步</span><SkipForward size={14}/></button>
          <button className="icon-button labeled-control" aria-label="重播当前步骤" title="重播当前步骤" disabled={Boolean(event.failure)} onClick={() => dispatch({ type: 'REPLAY' })}><Repeat2 size={14}/><span>重播本步</span></button>
          <button className="icon-button labeled-control" aria-label="重置场景" title="重置场景" onClick={() => dispatch({ type: 'RESET' })}><RotateCcw size={14}/><span>重置</span></button>
        </div>
        <div className="speed-segments" role="group" aria-label="播放速度">{[0.5, 1, 1.5, 2].map(speed => <button key={speed} aria-label={`${speed} 倍速`} aria-pressed={playback.speed === speed} onClick={() => dispatch({ type: 'SPEED', speed })}>{speed}×</button>)}</div>
        <div className="secondary-controls">
          <button className={`teacher-toggle ${teacherVisible ? 'on' : ''}`} aria-label="课堂讲解" aria-pressed={teacherVisible} onClick={() => setTeacherVisible(v => !v)}><span>{teacherVisible ? '隐藏课堂讲解' : '显示课堂讲解'}</span></button>
          <button className="icon-button fullscreen-control" aria-label={fullscreen ? '退出全屏' : '全屏'} title={fullscreen ? '退出全屏' : '全屏'} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}<span>{fullscreen ? '退出全屏' : '全屏'}</span></button>
          <button className="quiet-button help-control" aria-label="使用指南" title="使用指南" ref={helpTrigger} onClick={() => { dispatch({ type: 'PAUSE' }); setHelpVisible(true); }}><CircleHelp size={16}/></button>
        </div>
      </section>
    </header>
    <div className="workspace">
      <ScenarioSidebar meta={scenario.meta} fault={fault} onChange={changeScenario}/>
      <main className="main-content">
        
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="关闭通知"><X size={14}/></button></div>}
        <div className="lab-columns"><div className="lab-center"><TopologyView topology={scenario.topology} event={event} state={state} progress={playback.progress} selected={selected} onSelect={selectDevice} labels={labels} setLabels={setLabels} teacherVisible={teacherVisible} onCloseTeacher={() => setTeacherVisible(false)} onPause={() => dispatch({ type: 'PAUSE' })} onInspect={tab => { dispatch({ type: 'PAUSE' }); setDeviceTab(tab); setDeviceOpen(true); }}/>
          {event.failure && <section className="failure-panel" role="alert"><div><ShieldAlert size={23}/><h3>数据包为什么无法继续？</h3></div><p>{event.failure.reason}</p><dl><dt>诊断线索</dt><dd>{event.failure.diagnosis}</dd><dt>建议修复</dt><dd>{event.failure.fix}</dd></dl><button onClick={() => changeScenario(scenario.meta.id)}>清除故障，重新实验<ArrowRight size={14}/></button></section>}
          
        </div><aside className="lab-right inspector-workbench panel" aria-label="检查窗口">
          <div className="inspector-tabs" role="tablist" aria-label="检查窗口视图">
            <button id="packet-view-tab" role="tab" aria-selected={!deviceOpen} aria-controls="packet-view" tabIndex={deviceOpen ? -1 : 0} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'End') { e.preventDefault(); dispatch({ type: 'PAUSE' }); setDeviceOpen(true); document.getElementById('device-view-tab')?.focus(); } }} onClick={() => setDeviceOpen(false)}><Layers size={16}/>数据包检查器</button>
            <button id="device-view-tab" role="tab" aria-selected={deviceOpen} aria-controls="device-view" tabIndex={deviceOpen ? 0 : -1} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'Home') { e.preventDefault(); setDeviceOpen(false); document.getElementById('packet-view-tab')?.focus(); } }} onClick={() => { dispatch({ type: 'PAUSE' }); setDeviceOpen(true); }}><Database size={16}/>设备透视<span>{selected}</span></button>
          </div>
          <div id="packet-view" role="tabpanel" aria-labelledby="packet-view-tab" className="right-tab-content" hidden={deviceOpen}><PacketInspector event={event} state={state} isDhcp={scenario.meta.id === 'dhcp'}/></div>
          <div id="device-view" role="tabpanel" aria-labelledby="device-view-tab" className="right-tab-content device-inspector-view" hidden={!deviceOpen}>
            <div className="device-view-caption"><span>点击拓扑设备，查看当前步骤的内部表项</span><button aria-label="收起设备透视" title="返回数据包检查器" onClick={() => setDeviceOpen(false)}><X size={14}/></button></div>
            <DeviceInspector topology={scenario.topology} state={state} event={event} selected={selected} setSelected={selectDevice} tab={deviceTab} setTab={setDeviceTab}/>
          </div>
        </aside></div>
        
        <div className="lesson-bottom without-teacher"><section className="timeline-panel panel" aria-label="事件时间线"><div className="panel-heading"><h2><ListOrdered size={18}/>事件时间线<span className="small-tag">{scenario.events.length} 个步骤</span></h2><span className="tiny-note">点击步骤或拖动滑块，回到任意时刻</span></div><div className="timeline-scrubber"><span>{String(event.index + 1).padStart(2, '0')}</span><input aria-label="拖动时间线" type="range" min="0" max={scenario.events.length - 1} value={event.index} onChange={e => dispatch({ type: 'SEEK', index: Number(e.target.value) })} style={{ '--range-progress': `${event.index / (scenario.events.length - 1) * 100}%` } as React.CSSProperties}/><span>{scenario.events.length}</span></div><div className="phase-jumps">{phases.map(phase => <button key={phase.name} className={phase.name === event.phase ? 'active' : ''} onClick={() => dispatch({ type: 'SEEK', index: phase.index })}>{phase.name}</button>)}</div><div className="timeline-events">{scenario.events.map(item => <button ref={item.index === event.index ? timelineCurrent : undefined} data-testid={`event-${item.index}`} key={item.id} className={`timeline-event ${item.index === event.index ? 'current' : ''} ${item.index < event.index ? 'completed' : ''} ${item.failure ? 'failed' : ''}`} aria-current={item.index === event.index ? 'step' : undefined} aria-label={`步骤 ${item.index + 1}：${item.name}`} onClick={() => dispatch({ type: 'SEEK', index: item.index })}><div className="timeline-event-top"><span className="timeline-number">{item.index < event.index ? <Check size={12}/> : String(item.index + 1).padStart(2, '0')}</span><ProtocolBadge protocol={item.protocol}/><span className="event-state">{item.index === event.index ? item.failure ? '已停止' : '当前步骤' : item.index < event.index ? '已完成' : '待执行'}</span></div><strong>{item.name}</strong><div className="timeline-path">{item.sender}{item.sender === item.receiver ? <span>· 设备内部</span> : <><ArrowRight size={11}/>{item.receiver}</>}</div><p title={item.description}>{item.description}</p></button>)}</div></section></div>
<footer className="main-footer"><span><Info size={13}/>本实验为教学仿真，不连接真实设备、不发送真实网络请求，也不等同于抓包工具。</span><span><Activity size={13}/>确定性事件引擎<span className="footer-dot"/>本地运行</span></footer>
      </main>
    </div>
    {helpVisible && <div className="modal-backdrop" onClick={closeHelp}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); helpClose.current?.focus(); } }}><button ref={helpClose} className="icon-button modal-close" aria-label="关闭使用指南" onClick={closeHelp}><X size={20}/></button><div className="help-icon"><FlaskConical size={30}/></div><h2 id="help-title">跟着数据包，理解网络。</h2><p>不用输入命令，从左侧选择一个场景即可开始。</p><ol><li><strong>先看一步</strong>使用「下一步」观察设备如何处理数据；点击设备会暂停播放并切换右侧设备透视。</li><li><strong>拆开数据包</strong>右侧按 Ethernet → IPv4 / ARP → TCP / UDP → 应用展开。黄色字段是当前讲解重点。</li><li><strong>前后作比较</strong>拖动时间线可准确恢复该事件结束后的状态。跨网段时查看「地址变化表」。</li><li><strong>试着找故障</strong>选择故障后会自动切到适用场景。红色面板会解释停止位置、诊断线索和修复方法。</li></ol><div className="keyboard-help"><span><kbd>Space</kbd>播放 / 暂停</span><span><kbd>←</kbd><kbd>→</kbd>逐步观察</span></div><p className="help-limit">动画表示当前事件过程，表项显示该事件完成后的快照。交换机老化与租约使用固定教学值；TIME-WAIT 等待以事件快进表示；不模拟 NAT、HTTPS、链路误码或完整重传机制。</p></section></div>}
  </div>;
}
