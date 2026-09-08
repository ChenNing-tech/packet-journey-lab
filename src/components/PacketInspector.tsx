import { useEffect, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Layers3, PackageOpen } from 'lucide-react';
import type { Fields, LabEvent, SimulationState } from '../simulation/types';
import { ProtocolBadge } from './ProtocolBadge';

const layerNames: Record<string, { name: string; short: string; level: string }> = {
  ethernet: { name: 'Ethernet II', short: '以太网帧头', level: 'L2' },
  arp: { name: 'ARP', short: '地址解析', level: 'L2' },
  ipv4: { name: 'IPv4', short: '网络层头部', level: 'L3' },
  icmp: { name: 'ICMP', short: '控制报文', level: 'L3' },
  tcp: { name: 'TCP', short: '传输层头部', level: 'L4' },
  udp: { name: 'UDP', short: '传输层头部', level: 'L4' },
  application: { name: '应用数据', short: '应用层载荷', level: 'L7' },
};
const friendly: Record<string, string> = { 'Destination MAC': '目的 MAC', 'Source MAC': '源 MAC', EtherType: '协议类型', Payload: '载荷', Version: '版本', 'Header Length': '首部长度', 'Total Length': '总长度', TTL: '生存时间', Protocol: '上层协议', 'Header Checksum': '首部校验和', 'Source IP': '源 IP', 'Destination IP': '目的 IP', Operation: '操作类型', 'Sender MAC': '发送方 MAC', 'Sender IP': '发送方 IP', 'Target MAC': '目标 MAC', 'Target IP': '目标 IP', Type: '类型', Code: '代码', Identifier: '标识符', 'Sequence Number': '序列号', 'Acknowledgment Number': '确认号', 'Source Port': '源端口', 'Destination Port': '目的端口', Flags: '标志位', Window: '接收窗口', Length: '长度', Checksum: '校验和' };

const primaryFields: Record<string, string[]> = {
  ethernet: ['Source MAC', 'Destination MAC', 'EtherType'],
  ipv4: ['Source IP', 'Destination IP', 'TTL', 'Protocol'],
  arp: ['Operation', 'Sender IP', 'Sender MAC', 'Target IP', 'Target MAC'],
  tcp: ['Source Port', 'Destination Port', 'Flags', 'Sequence Number', 'Acknowledgment Number'],
};

export default function PacketInspector({ event, state, isDhcp }: { event: LabEvent; state: SimulationState; isDhcp: boolean }) {
  const [showFields, setShowFields] = useState(true);
  const [open, setOpen] = useState<string[]>(['ethernet', 'ipv4']);
  useEffect(() => { setOpen(previous => Array.from(new Set([...previous, ...event.highlightLayers]))); }, [event.id, event.highlightLayers]);
  const packet = event.packet;
  const compare = event.sender === 'R1' && !!packet?.ipv4 && !!state.routerView.received?.ipv4 && packet.ipv4['Source IP'] === state.routerView.received.ipv4['Source IP'] && packet.ipv4['Destination IP'] === state.routerView.received.ipv4['Destination IP'];
  const renderFields = (fields: Fields, layerKey: string) => <dl className="packet-fields">{Object.entries(fields).map(([name, value]) => {
    const original = compare && (layerKey === 'ethernet' || layerKey === 'ipv4') ? state.routerView.received?.[layerKey]?.[name] : undefined;
    const changed = original !== undefined && original !== value;
    const tracked = ['Source MAC', 'Destination MAC', 'Source IP', 'Destination IP', 'TTL'].includes(name) && original !== undefined;
    return <div className={`${event.highlightFields.includes(name) ? 'field-highlight' : ''} ${changed ? 'field-changed' : ''}`} key={name}>
      <dt title={name}>{friendly[name] ?? name}<small>{friendly[name] ? name : ''}</small></dt>
      <dd className={name === 'Message' || name === 'FCS' ? 'field-text' : ''}><span>{String(value)}</span>{tracked && <span className={changed ? 'field-change-tag changed' : 'field-change-tag stable'}>{changed ? '已变化' : '未变化'}</span>}{changed && <small className="old-field-value">原 {String(original)}</small>}</dd>
    </div>;
  })}</dl>;
  return <section className="panel inspector" aria-label="数据包检查器">
    <div className="panel-heading"><h2><Layers3 size={17}/>数据包检查器</h2><button className="icon-button" onClick={() => setShowFields(v => !v)} title={showFields ? '隐藏字段' : '显示字段'} aria-label={showFields ? '隐藏字段' : '显示字段'}>{showFields ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div>
    <div className="inspector-intro"><span>由外到内 · 点击协议层展开</span>{packet && <ProtocolBadge protocol={packet.protocol}/>}</div>
    <div className="inspector-body">
      {!packet ? <div className="empty-packet"><div className="empty-packet-icon"><PackageOpen size={34}/></div><h3>数据包还在准备中</h3><p>此步骤在检查本机状态。<br/>发送数据时，协议字段会在这里展开。</p><div className="layer-preview"><span>Ethernet II</span><span>IPv4</span><span>TCP / UDP</span><span>应用数据</span></div><small>按「下一步」开始观察</small></div> : <>
        <div className="packet-summary"><span className="packet-symbol">↳</span><div><strong>{packet.label}</strong><small>{event.sender === event.receiver ? `${event.receiver} · 设备内部处理` : `${event.sender} → ${event.receiver}`}</small></div>{!packet.ethernet && <span className="small-tag">未封装 L2</span>}</div>
        {Object.entries(layerNames).filter(([key]) => packet[key as keyof typeof packet]).map(([key, layer]) => {
          const fields = packet[key as keyof typeof packet] as Fields;
          const active = event.highlightLayers.includes(key);
          const expanded = open.includes(key);
          const primary = primaryFields[key] ?? Object.keys(fields);
          const visible = Object.fromEntries(primary.filter(name => name in fields).map(name => [name, fields[name]]));
          const secondary = Object.fromEntries(Object.entries(fields).filter(([name]) => !primary.includes(name)));
          return <div className={`packet-layer packet-layer-${key} ${active ? 'layer-active' : ''}`} key={key}>
            <button className="layer-heading" aria-expanded={expanded && showFields} onClick={() => { setShowFields(true); setOpen(items => items.includes(key) ? items.filter(i => i !== key) : [...items, key]); }}><span className={`layer-level layer-${key}`}>{layer.level}</span><span><strong>{key === 'application' ? `${packet.protocol} 数据` : layer.name}</strong><small>{layer.short}</small></span><ChevronDown size={15} className={expanded && showFields ? 'chevron open' : 'chevron'}/></button>
            {expanded && showFields && <>{renderFields(visible, key)}{Object.keys(secondary).length > 0 && <details className="more-fields"><summary>其余 {Object.keys(secondary).length} 个字段</summary>{renderFields(secondary, key)}</details>}</>}
          </div>;
        })}
        {packet.ethernet && <div className="fcs-strip"><span>帧尾 · FCS</span><span>CRC-32 · 说明性展示</span></div>}
        <div className="field-legend"><span><i className="changed"/>已变化</span><span><i/>未变化</span><span>与 R1 收到的原包比较</span></div>
        <p className="packet-footnote">重点字段优先显示，展开可查看完整字段。所有数值来自当前事件，不是真实抓包。</p>
      </>}
      {isDhcp && <div className="client-config"><h3>客户端配置 <span>{state.config.status}</span></h3><dl>{Object.entries({ IPv4: state.config.ip, 子网掩码: state.config.mask, 默认网关: state.config.gateway, DNS: state.config.dns, 租期: state.config.lease }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>}
    </div>
  </section>;
}
