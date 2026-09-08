import { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp, Database, Network, Table2 } from 'lucide-react';
import type { Device, DeviceId, LabEvent, SimulationState, Topology } from '../simulation/types';
import { protocolColors, ProtocolBadge } from './ProtocolBadge';
import { DeviceGlyph } from './DeviceIcon';
import TeachingCard from './TeachingCard';

function displayPoint(device: Device, topology: Topology) {
  if (topology.routed) {
    const hasDns = topology.devices.some(d => d.id === 'DNS');
    const x: Partial<Record<DeviceId, number>> = { PC1: 88, PC2: 88, SW1: 294, R1: 500, SW2: 706, Server1: 912, DNS: 912 };
    const y = device.id === 'PC1' || device.id === 'DNS' ? 140 : device.id === 'PC2' || (device.id === 'Server1' && hasDns) ? 330 : 235;
    return { x: x[device.id] ?? device.x, y };
  }
  const hasDhcp = topology.devices.some(d => d.id === 'DHCP');
  const points: Partial<Record<DeviceId, { x: number; y: number }>> = { PC1: { x: 145, y: 140 }, PC2: { x: 145, y: 330 }, SW1: { x: 490, y: 235 }, R1: { x: 835, y: hasDhcp ? 140 : 235 }, DHCP: { x: 835, y: 330 } };
  return points[device.id] ?? { x: device.x, y: device.y };
}

export default function TopologyView({ topology, event, state, progress, selected, onSelect, labels, setLabels, onInspect, teacherVisible, onCloseTeacher, onPause }: {
  topology: Topology; event: LabEvent; state: SimulationState; progress: number; selected: DeviceId;
  onSelect: (id: DeviceId) => void; labels: boolean; setLabels: (value: boolean) => void; onInspect: (tab: 'device' | 'address') => void;
  teacherVisible: boolean; onCloseTeacher: () => void; onPause: () => void;
}) {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const uid = useId().replace(/:/g, '');
  const viewport = useRef<HTMLDivElement>(null);
  const [fitMap, setFitMap] = useState(false);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const point = (id: DeviceId) => displayPoint(topology.devices.find(d => d.id === id)!, topology);
  // Both servers share a column. DNS keeps its real SW1 connection, routed above
  // the backbone so it cannot be mistaken for an attachment to SW2.
  const linkPoints = (a: DeviceId, b: DeviceId) => {
    if (a === 'DNS' || b === 'DNS') {
      const points = [point('SW1'), { x: 350, y: 55 }, { x: 835, y: 55 }, point('DNS')];
      return a === 'DNS' ? points.reverse() : points;
    }
    return [point(a), point(b)];
  };
  const activeLinks = event.paths.flatMap(path => path.slice(1).map((id, i) => [path[i], id]));
  const color = event.failure ? '#DC2626' : protocolColors[event.protocol];
  const packetProgress = reduced ? 1 : Math.min(1, Math.max(0, progress * 1.4));
  const focusId = event.activeDevices.length === 1 ? event.activeDevices[0] : event.sender;
  const focused = point(focusId);
  const focusDevice = topology.devices.find(d => d.id === focusId)!;
  const edgeFocus = focusDevice.type === 'pc' || focusDevice.type === 'server' || (!topology.routed && focusId === 'R1');
  const marker = { x: focused.x + (edgeFocus ? focused.x < 500 ? 78 : -78 : 0), y: focused.y - (edgeFocus ? 40 : 103) };
  const showRouter = event.sender === 'R1' && Boolean(event.packet?.ipv4) && Boolean(state.routerView.received);
  const routerOrder = ['ROUTER_DECAPSULATE', 'ROUTER_LOOKUP_ROUTE', 'ROUTER_DECREMENT_TTL', 'ROUTER_RESOLVE_NEXT_HOP', 'ROUTER_REENCAPSULATE'];
  const routerStep = routerOrder.indexOf(event.type);
  const showSwitch = ['SWITCH_LEARN_SOURCE_MAC', 'SWITCH_LOOKUP_MAC', 'SWITCH_FLOOD_BROADCAST'].includes(event.type);
  const showNewFrame = showRouter && !!event.packet?.ethernet && !!state.routerView.outgoing;
  const reverse = event.packet?.ipv4?.['Destination IP'] === state.config.ip;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const centerActiveDevice = () => {
      if (element.scrollWidth > element.clientWidth) element.scrollTo({ left: Math.max(0, focused.x / 1000 * element.scrollWidth - element.clientWidth / 2), behavior: 'instant' });
    };
    centerActiveDevice();
    const observer = new ResizeObserver(centerActiveDevice);
    observer.observe(element);
    return () => observer.disconnect();
  }, [event.id, focused.x, fitMap]);

  return <section className="topology-panel panel" aria-label="网络拓扑动画">
    <div className="panel-heading"><h2><Network size={17}/>网络拓扑 <span className="small-tag">教学仿真</span></h2><div className="topology-actions"><button onClick={() => onInspect('device')} title="查看 MAC 表、ARP 缓存与路由表"><Database size={14}/><span>设备表项</span></button>{topology.routed && <button onClick={() => onInspect('address')}><Table2 size={14}/><span>对比地址</span></button>}<label className="check-label"><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/>地址标签</label></div></div>
    <div className="topology-canvas">
      <div className="canvas-note"><span className={`status-dot ${event.failure ? 'red' : ''}`}/>{event.failure ? '通信已中断' : event.broadcast ? '广播 · 同一 VLAN 内扩散' : event.paths.length ? '正在沿链路传输' : '观察设备内部处理'}<span className="canvas-note-secondary">点击设备，展开内部表项</span></div>
      <div ref={viewport} className={fitMap ? 'topology-viewport fit-map' : 'topology-viewport'}><svg className="topology-svg" viewBox="0 0 1000 520" role="group" aria-label="可交互的网络设备与数据包路径">
        <defs><pattern id={`${uid}-dots`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#D7E3F2"/></pattern><marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10 3 5z" fill={color}/></marker><filter id={`${uid}-cardShadow`} x="-10%" y="-10%" width="120%" height="135%"><feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#42618A" floodOpacity=".10"/></filter></defs>
        <rect width="1000" height="520" fill={`url(#${uid}-dots)`} opacity=".46"/>
        <text x={topology.routed ? 54 : 111} y="45" className="endpoint-label">PC 终端</text><text x="946" y="45" textAnchor="end" className="endpoint-label">{topology.routed ? '服务器' : '网关 / 服务'}</text>
        {topology.routed ? <><g className="subnet-badge" transform="translate(235,478)"><rect x="-96" width="192" height="31" rx="8"/><text y="20" textAnchor="middle">192.168.10.0/24</text></g><g className="subnet-badge" transform="translate(761,478)"><rect x="-96" width="192" height="31" rx="8"/><text y="20" textAnchor="middle">192.168.20.0/24</text></g></> : <g className="subnet-badge" transform="translate(200,478)"><rect x="-110" width="220" height="31" rx="8"/><text y="20" textAnchor="middle">同一局域网 · 192.168.1.0/24</text></g>}
        {topology.links.map((link, i) => {
          const a = point(link.a), b = point(link.b);
          const points = linkPoints(link.a, link.b).map(p => `${p.x},${p.y}`).join(' ');
          const deviceA = topology.devices.find(d => d.id === link.a)!; const deviceB = topology.devices.find(d => d.id === link.b)!;
          const active = activeLinks.some(pair => pair.includes(link.a) && pair.includes(link.b));
          const down = deviceA.interfaces.find(n => n.name === link.aPort)?.up === false || deviceB.interfaces.find(n => n.name === link.bPort)?.up === false;
          return <g key={i}><polyline data-testid={`link-${link.a}-${link.b}`} points={points} fill="none" strokeLinejoin="round" stroke={down ? '#E59696' : active ? color : '#819ABA'} strokeWidth={active ? 4 : 2.3} strokeDasharray={down ? '5 5' : undefined}/>{active && !down && <polyline points={points} fill="none" stroke="white" strokeWidth="1.8" strokeDasharray="1 6" opacity=".65"/>}{a.y === b.y && <text x={(a.x + b.x) / 2} y={a.y + 25} textAnchor="middle" className="link-label">{link.a === 'PC1' ? link.bPort : link.aPort}</text>}{link.b === 'DNS' && <text x="595" y="42" textAnchor="middle" className="link-label">DNS 直连 SW1 · 192.168.10.0/24</text>}</g>;
        })}
        {topology.devices.map(device => {
          const active = event.activeDevices.includes(device.id), chosen = selected === device.id;
          const error = Boolean(event.failure && active), ip = device.id === 'PC1' ? state.config.ip : device.interfaces[0].ip;
          const location = point(device.id);
          return <g key={device.id} transform={`translate(${location.x},${location.y})`} className={`device-node ${active ? 'active' : ''} ${chosen ? 'chosen' : ''}`} role="button" tabIndex={0} aria-label={`查看 ${device.name} 设备详情`} onClick={() => onSelect(device.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(device.id); } }}>
            <title>{device.name} · {device.interfaces.map(n => `${n.name}: ${n.ip}/${n.prefix} · ${n.mac}`).join('\n')} · {state.statuses[device.id]}</title>
            <rect className="device-hitbox" x="-64" y="-60" width="128" height="173" rx="15" fill="transparent"/>
            <g transform="scale(1.04)"><DeviceGlyph type={device.type} service={device.id === 'DNS' || device.id === 'DHCP' ? device.id : undefined}/></g>
            <circle cx="47" cy="-34" r="4.5" fill={!device.interfaces[0].up || error ? '#DC2626' : '#2CA873'} stroke="white" strokeWidth="2"/>
            <text y="73" textAnchor="middle" className="device-name">{device.name}</text>
            {labels && <><text y="94" textAnchor="middle" className="device-address">{device.type === 'switch' ? '以太网交换机' : ip === '0.0.0.0' ? '未配置 IPv4' : ip}</text><text y="111" textAnchor="middle" className="device-mac">{device.type === 'switch' ? `VLAN 1 · ${device.interfaces.length} 个端口` : `…${device.interfaces[0].mac.slice(-11)}`}</text></>}
          </g>;
        })}
        <g transform={`translate(${marker.x},${marker.y})`} className="current-location"><text y="-27" textAnchor="middle" fill={event.failure ? '#DC2626' : color}>当前位置：{focusId}</text><path d="M0 20c-4-7-14-16-14-24a14 14 0 0 1 28 0c0 8-10 17-14 24z" fill={color}/><circle cy="-4" r="5.5" fill="white"/><path d={edgeFocus ? `M0 24l${focused.x < 500 ? -27 : 27} 14` : 'M0 24v19'} stroke={color} strokeDasharray="3 3" opacity=".5"/></g>
        {event.packet && event.paths.map((path, i) => {
          if (path.length < 2) return null;
          const points = path.slice(1).flatMap((id, index) => linkPoints(path[index], id).slice(index ? 1 : 0));
          const lengths = points.slice(1).map((p, index) => Math.hypot(p.x - points[index].x, p.y - points[index].y));
          const total = lengths.reduce((sum, length) => sum + length, 0);
          const inset = Math.min(55, total * .3);
          let remaining = inset + (total - 2 * inset) * packetProgress;
          let segment = 0;
          while (segment < lengths.length - 1 && remaining > lengths[segment]) { remaining -= lengths[segment]; segment++; }
          const a = points[segment], b = points[segment + 1];
          const t = remaining / lengths[segment], x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          const label = event.packet!.label, width = Math.max(92, label.length * 7 + 25);
          const labelX = Math.max(width / 2 + 8, Math.min(992 - width / 2, x)) - x;
          const labelY = y < 110 ? 22 : -62;
          return <g key={`${event.id}-${i}`} transform={`translate(${x},${y})`} className="packet-capsule" aria-label={`${label}：${path.join(' → ')}`}><circle r="7" fill="white" stroke={color} strokeWidth="3"/><g transform={`rotate(${angle})`}><path d="M13-5 20 0 13 5" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round"/></g><g transform={`translate(${labelX},${labelY})`}><rect x={-width / 2} width={width} height="30" rx="7" fill="white" stroke={color} strokeWidth="1.2"/><rect x={-width / 2 + 1} y="1" width={width - 2} height="28" rx="6" fill={color} opacity=".08"/><text textAnchor="middle" y="20" fill={event.protocol === 'ARP' ? '#9A6100' : color} fontSize="12" fontWeight="600">{label}</text></g></g>;
        })}
        {showNewFrame && <g transform={`translate(${reverse ? 159 : 597},74)`} className="new-frame-callout"><rect width="244" height="81" rx="8" fill="#FFFAF2" stroke="#EDAB55"/><text x="122" y="23" textAnchor="middle" fontSize="13" fill="#AD650D" fontWeight="650">重新封装 · 新以太网帧</text><text x="14" y="45" fontSize="11" fill="#556B84">Src: {event.packet?.ethernet?.['Source MAC']}</text><text x="14" y="64" fontSize="11" fill="#556B84">Dst: {event.packet?.ethernet?.['Destination MAC']}</text><path d={reverse ? "M238 93H4m6-4-7 4 7 4" : "M4 93h234m-6-4 7 4-7 4"} stroke="#E9A040" strokeWidth="1.5" fill="none"/></g>}
        {showRouter && <g transform="translate(363,376)" className="device-process" filter={`url(#${uid}-cardShadow)`}><rect width="274" height="132" rx="11" fill="white" stroke="#D9E4F2"/><text x="17" y="26" className="process-title">路由器处理过程</text><text x="258" y="26" textAnchor="end" className="process-caption">R1 · IPv4</text>{[
          { label: '移除二层帧头', done: !!state.routerView.ipPacket, current: routerStep === 0 },
          { label: '查询路由表', done: routerStep > 1 || (routerStep < 0 && !!state.routeMatch), current: routerStep === 1 },
          { label: `TTL ${state.routerView.ttlBefore ?? 64} → ${state.routerView.ttlAfter ?? '待处理'}`, done: routerStep > 2 || (routerStep < 0 && state.routerView.ttlAfter !== undefined), current: routerStep === 2 || routerStep === 3 },
          { label: '重新封装以太网帧', done: routerStep < 0 && !!state.routerView.outgoing, current: routerStep === 4 },
        ].map((item, i) => <g key={i} transform={`translate(14,${39 + i * 22})`}>{item.current && <rect x="-3" y="-3" width="251" height="24" rx="5" fill="#EEF5FF"/>}<circle cx="11" cy="9" r="8" fill={item.current ? '#1765E3' : item.done ? '#E7F4ED' : '#E8EDF5'}/><text x="11" y="13" textAnchor="middle" fontSize="10" fill={item.current ? 'white' : item.done ? '#358264' : '#7186A3'}>{i + 1}</text><text x="31" y="13" fontSize="12" fill={item.current ? '#1765E3' : '#586F8B'}>{item.label}</text><text x="237" y="13" textAnchor="end" fontSize="13" fill={item.current ? '#1765E3' : '#24A16B'}>{item.current ? '▶' : item.done ? '✓' : ''}</text></g>)}</g>}
        {showSwitch && <g transform={`translate(${topology.routed ? 362 : 352},383)`} className="device-process" filter={`url(#${uid}-cardShadow)`}><rect width="284" height="118" rx="11" fill="white" stroke="#D9E4F2"/><text x="16" y="26" className="process-title">交换机处理过程</text><text x="267" y="26" textAnchor="end" className="process-caption">{event.sender} · Ethernet</text><text x="16" y="53" fontSize="12" fill="#496B96">{event.type === 'SWITCH_LEARN_SOURCE_MAC' ? '① 学习源 MAC 与入端口' : event.type === 'SWITCH_FLOOD_BROADCAST' ? '② 同 VLAN 泛洪，不返回入端口' : '② 查询目的 MAC，选择出端口'}</text><text x="16" y="78" fontSize="11" fill="#697F9B">入端口：{event.ingress ?? '无'}　 出端口：{event.egress?.join(' / ') ?? '待查表'}</text><text x="16" y="100" fontSize="10" fill="#788BA5">{event.type === 'SWITCH_FLOOD_BROADCAST' ? '路由器不会将此二层广播转发到另一网段' : '只处理二层转发，不修改源 / 目的 IP 与 TTL'}</text></g>}
        {!showRouter && !showSwitch && <text x="500" y="448" textAnchor="middle" className="canvas-instruction">{event.failure ? '沿着红色提示定位故障，查看诊断线索' : '点击设备，检查 MAC 表、ARP 缓存或路由表'}</text>}
      </svg></div><div className="topology-pan-hint"><span>← 左右拖动查看完整拓扑 →</span><button onClick={() => setFitMap(v => !v)}>{fitMap ? "放大设备" : "查看全图"}</button></div>
      <div className="topology-legend">{(['ARP', 'ICMP', 'TCP', 'DNS', 'DHCP', 'HTTP'] as const).map(protocol => <span key={protocol}><i style={{ background: protocolColors[protocol] }}/>{protocol}</span>)}<span className="legend-note"><CircleHelp size={13}/>文字与颜色同时标识协议</span></div>
      <div className={`canvas-teaching-area ${teacherVisible ? 'with-teacher' : ''}`}>
        <div className={`event-focus ${event.failure ? 'failure-focus' : ''}`} aria-live="polite"><span className="event-step">{String(event.index + 1).padStart(2, '0')}</span><div><div className="event-focus-title"><ProtocolBadge protocol={event.protocol}/><h3>{event.name}</h3></div><p>{event.description}</p>{teacherVisible && <small className="snapshot-note">观察提示：动画演示当前过程，右侧表项是本步骤完成后的快照。</small>}</div></div>
        {teacherVisible && <TeachingCard event={event} onClose={onCloseTeacher} onEditStart={onPause}/>}
      </div>
    </div>
  </section>;
}
