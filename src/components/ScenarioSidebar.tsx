import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, FlaskConical, PanelLeftClose, PanelLeftOpen, Pin, PinOff, ShieldAlert } from 'lucide-react';
import { FAULTS, SCENARIOS, SCENARIO_COUNTS } from '../simulation/scenarios';
import type { FaultId, ScenarioId, ScenarioMeta } from '../simulation/types';
import { ScenarioIcon } from './DeviceIcon';
import { ProtocolBadge } from './ProtocolBadge';

const storageKey = 'packet-lab.sidebar.v1';
function storedPreference() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (typeof saved?.open === 'boolean' && typeof saved?.pinned === 'boolean') return { open: saved.open, pinned: saved.pinned && saved.open };
  } catch { /* Storage may be unavailable; the controls still work in memory. */ }
  return { open: true, pinned: true };
}

export default function ScenarioSidebar({ meta, fault, onChange }: { meta: ScenarioMeta; fault: FaultId; onChange: (id: ScenarioId, fault?: FaultId) => void }) {
  const [preference, setPreference] = useState(storedPreference);
  const { open, pinned } = preference;
  const shell = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const faultSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(preference)); } catch { /* Optional local preference. */ } }, [preference]);
  useEffect(() => {
    if (!open || pinned) return;
    const outside = (event: PointerEvent) => { if (!shell.current?.contains(event.target as Node)) setPreference({ open: false, pinned: false }); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPreference({ open: false, pinned: false }); toggle.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, pinned]);
  const change = (id: ScenarioId, nextFault: FaultId = 'none') => {
    onChange(id, nextFault);
    if (!pinned) { setPreference({ open: false, pinned: false }); toggle.current?.focus(); }
  };
  return <div ref={shell} className={`sidebar-shell ${open ? 'is-expanded' : 'is-collapsed'} ${pinned ? 'is-pinned' : 'is-unpinned'}`}>
    <aside className="sidebar scenario-sidebar" aria-label="实验场景选择">
      <div className="sidebar-toolbar"><strong>实验场景 <small>08</small></strong><div>
        <button ref={toggle} title={open ? '收起场景栏，保留快捷图标' : '临时展开场景栏'} aria-label={open ? '收起实验场景' : '展开实验场景'} aria-expanded={open} onClick={() => setPreference({ open: !open, pinned: false })}>{open ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button>
        <button title={pinned ? '取消固定，选择场景后自动收起' : '固定展开，选择场景后保持可见'} aria-label={pinned ? '取消固定场景栏' : '固定场景栏'} aria-pressed={pinned} onClick={() => setPreference({ open: true, pinned: !pinned })}>{pinned ? <Pin size={15}/> : <PinOff size={15}/>}</button>
      </div></div>
      <p className="sidebar-mode-note">{pinned ? '已固定 · 场景始终展开' : '临时展开 · 选完自动收起'}</p>
      <nav className="scenario-nav">{SCENARIOS.map(item => <button key={item.id} className={`scenario-button ${meta.id === item.id ? 'selected' : ''}`} aria-label={item.title} aria-current={meta.id === item.id ? 'page' : undefined} title={`${item.title} · ${item.goal}`} onClick={() => change(item.id)}><span className="scenario-icon"><ScenarioIcon id={item.id}/></span><div className="scenario-button-content"><strong>{item.title}</strong><span>{item.protocols.join(' · ')}<span>{SCENARIO_COUNTS[item.id]} 步</span></span><small>{item.difficulty}</small></div>{meta.id === item.id && <ChevronRight size={13}/>}</button>)}</nav>
      <button className={`rail-fault ${fault !== 'none' ? 'fault-active' : ''}`} aria-label="展开故障设置" title="故障演示" onClick={() => { setPreference({ open: true, pinned: false }); requestAnimationFrame(() => faultSelect.current?.focus()); }}><ShieldAlert size={19}/></button>
      <div className="sidebar-learning"><div><BookOpen size={16}/><h3>本节学习目标</h3></div><p>{meta.goal}</p><div className="learning-protocols">{meta.protocols.map(protocol => <ProtocolBadge key={protocol} protocol={protocol}/>)}</div></div>
      <div className={`fault-control ${fault !== 'none' ? 'fault-active' : ''}`}><label htmlFor="fault-select"><ShieldAlert size={16}/>故障演示<span>{fault === 'none' ? '关闭' : '已开启'}</span></label><select ref={faultSelect} id="fault-select" value={fault} onChange={event => { const value = event.target.value as FaultId; change(value === 'none' ? meta.id : FAULTS.find(item => item.id === value)!.scenario, value); }}>{FAULTS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><p>注入故障，找到数据包停下的原因。<br/>自动切换到适用场景并清空状态。</p></div>
      <div className="sidebar-footer"><FlaskConical size={17}/><div><strong>为理解而实验</strong><p>教学级离散事件仿真 · v1.0</p></div></div>
    </aside>
  </div>;
}
