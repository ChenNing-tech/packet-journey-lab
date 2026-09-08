import { applyChanges, clone, longestPrefixMatch, sameSubnet } from './engine';
import { arpPacket, BROADCAST, byteLength, createTopology, decrementTtl, DOMAIN, ethernet, getDevice, getInterface, GET_BODY, initialState, ipPacket, neighbors, portTo, RESPONSE_BODY } from './network';
import type { Change, DeviceId, FaultId, Interface, LabEvent, Packet, Protocol, Scenario, ScenarioId, ScenarioMeta, SimulationState, Topology } from './types';

export const SCENARIOS: ScenarioMeta[] = [
  { id: 'lan-ping', title: '同一局域网内 Ping', subtitle: '第一帧，从这里出发', difficulty: '入门', protocols: ['ARP', 'ICMP'], goal: '理解同网段判断、ARP 广播、交换机学习与 ICMP 请求应答。' },
  { id: 'routed-ping', title: '跨网段 Ping', subtitle: '穿过路由器，抵达另一端', difficulty: '基础', protocols: ['ARP', 'ICMP'], goal: '对比每段链路的 MAC、端到端 IP 与 TTL，理解默认网关。' },
  { id: 'arp', title: 'ARP 地址解析', subtitle: '知道 IP，如何找到 MAC？', difficulty: '入门', protocols: ['ARP'], goal: '观察广播请求、单播应答和 ARP 缓存从无到有。' },
  { id: 'web', title: '访问 Web 服务器', subtitle: '一次网页请求的完整旅程', difficulty: '综合', protocols: ['DNS', 'ARP', 'TCP', 'HTTP'], goal: '串联域名解析、链路寻址、建立连接、HTTP 和连接释放。' },
  { id: 'dns', title: 'DNS 域名解析', subtitle: '把名字变成网络地址', difficulty: '基础', protocols: ['DNS', 'UDP', 'ARP'], goal: '区分 DNS 与 ARP，观察 UDP 53 端口和 DNS 缓存。' },
  { id: 'dhcp', title: 'DHCP 自动获取地址', subtitle: '新设备的网络入场券', difficulty: '基础', protocols: ['DHCP', 'UDP'], goal: '按 DORA 顺序观察地址、掩码、网关、DNS 和租期生效。' },
  { id: 'tcp-open', title: 'TCP 三次握手', subtitle: '建立一条可靠连接', difficulty: '进阶', protocols: ['TCP', 'ARP'], goal: '跟踪 SYN、SYN-ACK、ACK 与双方的序列号和连接状态。' },
  { id: 'tcp-close', title: 'TCP 连接释放', subtitle: '有始有终，双向关闭', difficulty: '进阶', protocols: ['TCP', 'ARP'], goal: '观察 FIN、ACK、半关闭与 TIME-WAIT，理解两个方向独立关闭。' },
];
export const FAULTS: { id: FaultId; title: string; scenario: ScenarioId }[] = [
  { id: 'none', title: '正常通信', scenario: 'routed-ping' },
  { id: 'bad-subnet', title: 'IP / 子网掩码配置错误', scenario: 'routed-ping' },
  { id: 'no-gateway', title: '默认网关为空', scenario: 'routed-ping' },
  { id: 'bad-gateway', title: '网关不在本地网段', scenario: 'routed-ping' },
  { id: 'host-off', title: '目标主机关闭', scenario: 'routed-ping' },
  { id: 'switch-off', title: '交换机接口关闭', scenario: 'routed-ping' },
  { id: 'router-off', title: '路由器接口关闭', scenario: 'routed-ping' },
  { id: 'no-route', title: '缺少目标网络路由', scenario: 'routed-ping' },
  { id: 'vlan', title: 'VLAN 不匹配', scenario: 'lan-ping' },
  { id: 'bad-dns', title: 'DNS 服务器地址错误', scenario: 'dns' },
  { id: 'ttl', title: 'TTL 减为 0', scenario: 'routed-ping' },
];

const questions: Record<Protocol, [string, string, string]> = {
  SYSTEM: ['设备先判断目标 IP 的什么特征？', '用自己的子网掩码比较源、目的网络号，再决定直接交付还是使用网关。', '默认网关是本地路由器接口的 IP，不是远程服务器 IP。'],
  ARP: ['ARP 广播能穿过路由器吗？', '不能。二层广播只在当前 VLAN / 广播域内扩散，路由器不把它转发到另一侧。', 'ARP 不查询域名，也不会寻找远程网段服务器的 MAC。'],
  ICMP: ['交换机会修改 IP 地址或 TTL 吗？', '本模型中的二层交换机不会。路由器转发 IP 数据包时 TTL 减 1。', 'Ping 使用 ICMP，不是 TCP 或 UDP，因此没有 TCP / UDP 端口。'],
  TCP: ['SYN 和 FIN 为什么各占一个序列号？', '它们需要被可靠确认；ACK 确认的是下一个期望收到的字节序号，纯 ACK 不消耗序列号。', '三次握手建立的是 TCP 连接，不是物理链路。'],
  UDP: ['UDP 报文发送前需要三次握手吗？', '不需要。UDP 提供无连接的数据报传输。', 'DNS 和 DHCP 的应用字段位于 UDP 的载荷中。'],
  DNS: ['DNS 与 ARP 分别解决什么问题？', 'DNS 把域名映射到 IP；ARP 获取本地链路上下一跳 IP 对应的 MAC。', 'DNS 返回 IP 地址，不返回 Web 服务器的 MAC 地址。'],
  DHCP: ['收到 Offer 后，客户端就能正式使用地址吗？', '本 DORA 场景中还不能；客户端选择地址并请求，收到 ACK 后正式应用配置。', 'DHCP Discover 的源 IP 可以是 0.0.0.0，因为客户端尚无可用地址。'],
  HTTP: ['HTTP GET 与 TCP 有什么关系？', 'HTTP 请求是应用层数据，装在已建立连接的 TCP 报文段中。', '本实验采用明文 HTTP/1.1、端口 80；没有模拟 HTTPS / TLS。'],
};

type EventInput = Partial<Omit<LabEvent, 'id' | 'index' | 'scenarioId'>> & Pick<LabEvent, 'type' | 'sender' | 'name' | 'description'>;
class Builder {
  topology: Topology;
  initial: SimulationState;
  state: SimulationState;
  events: LabEvent[] = [];
  stopped = false;
  phase = '准备通信';
  constructor(public id: ScenarioId, public fault: FaultId) {
    this.topology = createTopology(id);
    this.initial = initialState(this.topology, id);
    if (fault === 'bad-subnet') { this.initial.config.mask = '255.255.0.0'; getInterface(this.topology, 'PC1').prefix = 16; }
    if (fault === 'no-gateway') { this.initial.config.gateway = '未配置'; getDevice(this.topology, 'PC1').gateway = ''; }
    if (fault === 'bad-gateway') { this.initial.config.gateway = '192.168.99.1'; getDevice(this.topology, 'PC1').gateway = '192.168.99.1'; }
    if (fault === 'no-route') this.initial.routes = this.initial.routes.filter(r => r.network !== '192.168.20.0');
    if (fault === 'bad-dns') this.initial.config.dns = '192.168.10.99';
    if (fault === 'host-off') { this.initial.statuses.Server1 = '已关机'; getInterface(this.topology, 'Server1').up = false; }
    if (fault === 'switch-off') { this.initial.statuses.SW1 = 'GE0/1 已关闭'; getInterface(this.topology, 'SW1').up = false; }
    if (fault === 'router-off') { this.initial.statuses.R1 = 'GE0/0/0 已关闭'; getInterface(this.topology, 'R1').up = false; }
    if (fault === 'vlan') { getInterface(this.topology, 'PC2').vlan = 20; this.initial.statuses.PC2 = 'VLAN 20'; }
    this.state = clone(this.initial);
    this.add({ type: 'INITIALIZE', sender: 'PC1', name: '准备实验环境', description: id === 'dhcp' ? '客户端尚未配置 IPv4；准备通过 DHCP 获取网络参数。' : `拓扑已就绪，ARP 缓存与交换机 MAC 表为空${fault === 'none' ? '。' : '；已注入所选故障。'}`, teacher: '这是确定性的离散事件仿真。逐步前进会停在事件完成后的状态；回退和拖动时间线会重建对应步骤的所有表项。' });
  }
  nic(device: DeviceId, side = 0) { return getInterface(this.topology, device, side); }
  add(input: EventInput): void {
    if (this.stopped) return;
    const protocol = input.protocol ?? input.packet?.protocol ?? 'SYSTEM';
    const [question, answer, misconception] = questions[protocol];
    const receiver = input.receiver ?? input.sender;
    const event: LabEvent = {
      id: `${this.id}-${this.events.length}`, scenarioId: this.id, index: this.events.length,
      receiver, protocol, paths: [], packet: null, changes: [], highlightLayers: [], highlightFields: [],
      activeDevices: [receiver], phase: this.phase, duration: 2400,
      teacher: input.description, question, answer, misconception, ...input,
    };
    if (!input.highlightLayers) event.highlightLayers = event.packet?.arp ? ['arp'] : event.packet?.application ? ['application'] : event.packet?.tcp ? ['tcp'] : event.packet?.icmp ? ['icmp'] : ['ipv4'];
    if (!event.failure) event.changes.push({ kind: 'status', device: receiver, value: event.name });
    this.events.push(clone(event));
    this.state = applyChanges(this.state, event.changes);
    if (event.failure) this.stopped = true;
  }
  fail(device: DeviceId, reason: string, diagnosis: string, fix: string, packet: Packet | null = null) {
    this.add({ type: 'FAILURE', sender: device, name: '通信在此处停止', description: reason, packet, failure: { reason, diagnosis, fix }, changes: [{ kind: 'status', device, value: '故障 · 已停止' }], teacher: diagnosis, question: '应该先检查什么？', answer: fix, misconception: '“请求超时”只是现象，需要沿路径定位最早失败的具体原因。' });
  }
  learn(sw: DeviceId, from: DeviceId, packet: Packet) {
    const port = portTo(this.topology, sw, from);
    this.add({ type: 'SWITCH_LEARN_SOURCE_MAC', sender: sw, protocol: packet.protocol, packet, name: `${sw} 学习源 MAC`, description: `记录 ${packet.ethernet?.['Source MAC']} → ${port}，VLAN 1。学习依据是源地址。`, ingress: port, highlightLayers: ['ethernet'], highlightFields: ['Source MAC'], changes: [{ kind: 'learn', device: sw, entry: { mac: String(packet.ethernet?.['Source MAC']), port, vlan: 1, type: '动态', age: '300 s（教学固定值）' } }] });
  }
  flood(sw: DeviceId, from: DeviceId, packet: Packet) {
    const destinations = neighbors(this.topology, sw).filter(n => n !== from && this.nic(n).vlan === this.nic(from, from === 'R1' && sw === 'SW2' ? 1 : 0).vlan);
    this.add({ type: 'SWITCH_FLOOD_BROADCAST', sender: sw, receiver: sw, packet, name: `${sw} 泛洪广播`, description: `广播从 ${portTo(this.topology, sw, from)} 进入，复制到其余同 VLAN 端口；不会送回入接口。`, paths: destinations.map(n => [sw, n]), activeDevices: [sw, ...destinations], broadcast: true, ingress: portTo(this.topology, sw, from), egress: destinations.map(n => portTo(this.topology, sw, n)), highlightLayers: ['ethernet'], highlightFields: ['Destination MAC'], teacher: '交换机将广播帧复制到当前 VLAN 除入端口以外的各端口。路由器可在接收接口处理这个广播，但绝不会把原广播帧发到另一网段。' });
    if (destinations.includes('R1') && this.nic('R1').up) this.add({ type: 'ROUTER_STOP_BROADCAST', sender: 'R1', packet, name: 'R1 隔离二层广播', description: 'R1 接口接收本地广播；不从另一侧接口继续转发。若 ARP 目标是本接口，则稍后在本链路应答。', highlightLayers: ['ethernet'], highlightFields: ['Destination MAC'] });
  }
  switchForward(sw: DeviceId, from: DeviceId, to: DeviceId, packet: Packet) {
    this.learn(sw, from, packet);
    const known = this.state.macTables[sw]?.find(r => r.mac === packet.ethernet?.['Destination MAC'] && r.vlan === 1);
    const ingress = portTo(this.topology, sw, from);
    const egress = known ? [known.port] : neighbors(this.topology, sw).filter(n => n !== from && this.nic(n).vlan === 1).map(n => portTo(this.topology, sw, n));
    this.add({ type: 'SWITCH_LOOKUP_MAC', sender: sw, packet, name: known ? `${sw} 查表：已知单播` : `${sw} 查表：未知单播`, description: known ? `目的 MAC 命中 ${known.port}，只向该端口转发；IP 与 TTL 不变。` : '目的 MAC 尚未学习，只在本 VLAN 除入端口以外泛洪；不改变帧内 IP 地址。', ingress, egress, highlightLayers: ['ethernet'], highlightFields: ['Destination MAC'] });
    this.add({ type: 'SEND_FRAME', sender: sw, receiver: to, packet, paths: known ? [[sw, to]] : neighbors(this.topology, sw).filter(n => n !== from && this.nic(n).vlan === 1).map(n => [sw, n]), name: `${sw} → ${to}`, description: known ? `从 ${known.port} 发送 ${packet.label}，以太网源和目的 MAC 均保持不变。` : `未知单播副本从其余同 VLAN 端口发送，${to} 接收匹配自身 MAC 的帧。`, ingress, egress });
  }
  arp(src: DeviceId, dst: DeviceId, sw: DeviceId, srcSide = 0, dstSide = 0) {
    if (this.stopped) return;
    this.phase = 'ARP 地址解析';
    const source = this.nic(src, srcSide), target = this.nic(dst, dstSide);
    const cached = this.state.arpCaches[src]?.some(a => a.ip === target.ip && a.iface === source.name);
    this.add({ type: 'CHECK_ARP_CACHE', sender: src, protocol: 'ARP', name: `${src} 检查 ARP 缓存`, description: cached ? `已知 ${target.ip} 的 MAC，可以直接封装。` : `未找到 ${target.ip} 的 MAC，先在本链路发送 ARP Request。` });
    if (cached) return;
    const request = arpPacket(source, target);
    if (this.fault === 'switch-off' && src === 'PC1') { this.fail('SW1', 'SW1 的 GE0/1 已关闭，帧无法进入交换机。', 'PC1 的地址配置正确，但接入端口处于 administratively down；交换机没有学习到 PC1。', '开启 SW1 GE0/1，检查链路和网卡状态。', request); return; }
    this.add({ type: 'SEND_ARP_REQUEST', sender: src, receiver: sw, packet: request, name: `${src} 广播 ARP Request`, description: `谁拥有 ${target.ip}？请告诉 ${source.ip}。帧目的 MAC 为全 F。`, paths: [[src, sw]], broadcast: true, highlightLayers: ['ethernet', 'arp'], highlightFields: ['Destination MAC', 'Target IP'] });
    this.learn(sw, src, request);
    this.flood(sw, src, request);
    if (this.fault === 'vlan') { this.fail(sw, 'PC1 在 VLAN 1，PC2 在 VLAN 20，ARP 广播无法到达 PC2。', '两台主机看似使用同一 IP 网段，但二层广播域不同。PC2 端口不在本次泛洪集合内。', '将两台主机接入相同 VLAN；若保留不同 VLAN，应设计不同子网和三层路由。', request); return; }
    if (this.fault === 'router-off' && dst === 'R1') { this.fail('R1', 'R1 的 GE0/0/0 已关闭，无法响应网关 ARP。', 'PC1 已发送 ARP，但网关接口 down，无法提供下一跳 MAC。', '开启 R1 GE0/0/0，核对 IP / 掩码与交换机连接。', request); return; }
    if (this.fault === 'host-off' && dst === 'Server1') { this.fail(dst, 'Server1 已关闭，无法响应本地 ARP 请求。', 'R1 已命中目标网段路由，但目标主机不在线，下一跳 MAC 无法解析。', '启动 Server1，检查其网卡、电源与接入链路。', request); return; }
    this.add({ type: 'HANDLE_ARP_REQUEST', sender: dst, packet: request, name: `${dst} 识别目标 IP`, description: `ARP 的目标 IP ${target.ip} 是本接口地址。先记录发送方 IP / MAC，再准备单播应答。`, highlightFields: ['Target IP'], changes: [{ kind: 'arp', device: dst, entry: { ip: source.ip, mac: source.mac, iface: target.name, type: '动态 · 从请求学习' } }] });
    const reply = arpPacket(target, source, true);
    this.add({ type: 'SEND_ARP_REPLY', sender: dst, receiver: sw, packet: reply, paths: [[dst, sw]], name: `${dst} 单播 ARP Reply`, description: `${target.ip} 对应 ${target.mac}。直接向请求者的 MAC 应答。`, highlightFields: ['Operation', 'Sender MAC', 'Destination MAC'] });
    this.switchForward(sw, dst, src, reply);
    this.add({ type: 'UPDATE_ARP_CACHE', sender: src, packet: reply, name: `${src} 更新 ARP 缓存`, description: `保存 ${target.ip} → ${target.mac}，此后发送 IPv4 数据时可使用此映射。`, changes: [{ kind: 'arp', device: src, entry: { ip: target.ip, mac: target.mac, iface: source.name, type: '动态' } }], highlightFields: ['Sender IP', 'Sender MAC'] });
  }
  subnet(dst: DeviceId) {
    const pc = this.nic('PC1'), target = this.nic(dst);
    const local = sameSubnet(pc.ip, target.ip, pc.prefix);
    this.add({ type: 'CHECK_LOCAL_SUBNET', sender: 'PC1', name: local ? '目标在同一网段' : '目标不在本地网段', description: `${pc.ip}/${pc.prefix} 与 ${target.ip} ${local ? '网络号相同，直接解析目标 MAC' : '网络号不同，下一跳选择默认网关'}。`, teacher: local ? '主机先用自己的子网掩码计算网络号。同网段通信不需要经过默认网关。' : `目的 IP 始终是 ${target.ip}，但第一段链路的目的 MAC 必须属于本地网关。` });
    if (this.fault === 'no-gateway') { this.fail('PC1', '目的地址不在本地网段，且默认网关为空。', 'PC1 没有可用的下一跳，数据还没有进入交换机。', '配置默认网关 192.168.10.1。'); return; }
    if (this.fault === 'bad-gateway') { this.fail('PC1', '默认网关 192.168.99.1 不在 PC1 的本地网段。', '192.168.10.10/24 无法在本地链路直接解析这个网关。', '将默认网关改为本地路由器接口 192.168.10.1。'); return; }
    if (this.fault === 'bad-subnet') {
      const packet = arpPacket(pc, target);
      this.add({ type: 'SEND_ARP_REQUEST', sender: 'PC1', receiver: 'SW1', packet, paths: [['PC1', 'SW1']], broadcast: true, name: '错误地寻找远程主机 MAC', description: '/16 掩码让 PC1 误认为 192.168.20.100 就在本地，因而不使用网关。' });
      this.learn('SW1', 'PC1', packet); this.flood('SW1', 'PC1', packet);
      this.fail('PC1', '错误的 /16 掩码使 PC1 在错误的广播域中寻找 Server1。', 'ARP 目标是 192.168.20.100，但本地广播无法越过 R1，且本实验未启用 Proxy ARP。', '使用 192.168.10.10/24、掩码 255.255.255.0，并核对网关 192.168.10.1。', packet); return;
    }
    if (!local) this.add({ type: 'SELECT_GATEWAY', sender: 'PC1', name: '选择默认网关', description: '下一跳 IP 为 192.168.10.1；帧交给 R1 左侧接口，IP 数据包仍然寄往 Server1。', question: '第一帧的目的 MAC 是服务器的吗？', answer: '不是，是默认网关 R1 左侧接口的 MAC。目的 IP 才是远程服务器。' });
  }
  record(location: string, packet: Packet): Change {
    return { kind: 'address', value: { id: `${this.id}-${this.events.length}-address`, location, srcMac: String(packet.ethernet?.['Source MAC']), dstMac: String(packet.ethernet?.['Destination MAC']), srcIp: String(packet.ipv4?.['Source IP']), dstIp: String(packet.ipv4?.['Destination IP']), ttl: Number(packet.ipv4?.TTL) } };
  }
  transmit(src: DeviceId, dst: DeviceId, ip: Packet, arrivalChanges: Change[] = []) {
    if (this.stopped) return;
    const routed = (src === 'Server1' || dst === 'Server1') && this.topology.routed;
    const reverse = src === 'Server1';
    const sw: DeviceId = reverse ? 'SW2' : 'SW1';
    const target = routed ? this.nic('R1', reverse ? 1 : 0) : this.nic(dst);
    let packet = ethernet(ip, this.nic(src), target);
    this.add({ type: 'SEND_FRAME', sender: src, receiver: sw, packet, name: `${src} 发送 ${packet.label}`, description: `源 IP ${ip.ipv4?.['Source IP']}，目的 IP ${ip.ipv4?.['Destination IP']}；本段目的 MAC 为 ${target.mac}。`, paths: [[src, sw]], highlightLayers: ['ethernet', 'ipv4'], highlightFields: ['Destination MAC', 'Destination IP'], changes: routed ? [this.record(`${src} → R1`, packet)] : [] });
    this.switchForward(sw, src, routed ? 'R1' : dst, packet);
    if (routed) {
      const received = clone(packet);
      delete packet.ethernet;
      this.add({ type: 'ROUTER_DECAPSULATE', sender: 'R1', packet, name: 'R1 解封装以太网帧', description: '接收接口处理并移除原 Ethernet II 帧头与帧尾，取出 IPv4 数据包。', highlightLayers: ['ipv4'], changes: [{ kind: 'router', value: { received, ipPacket: packet, outgoing: undefined, ttlBefore: Number(packet.ipv4?.TTL), ttlAfter: undefined } }], teacher: '此时检查器不再显示以太网帧头。路由器并非把原帧直接穿透，而是先取出里面的 IP 数据包。' });
      const route = longestPrefixMatch(String(packet.ipv4?.['Destination IP']), this.state.routes);
      if (!route) { this.fail('R1', '路由表中没有匹配目的网络的路由。', 'R1 已取出 IP 数据包，但最长前缀匹配失败；不能仅凭目的 IP 猜测出接口。本演示在丢弃处停止，未继续展开 ICMP Destination Unreachable。', '恢复 192.168.20.0/24 经 GE0/0/1 的直连路由，检查接口地址与状态。', packet); return; }
      this.add({ type: 'ROUTER_LOOKUP_ROUTE', sender: 'R1', packet, name: 'R1 执行最长前缀匹配', description: `目的 IP 命中 ${route.network}/${route.prefix}，下一跳为${route.nextHop}，出接口 ${route.iface}。`, highlightLayers: ['ipv4'], highlightFields: ['Destination IP'], egress: [route.iface], changes: [{ kind: 'route', value: route }] });
      const before = Number(packet.ipv4?.TTL);
      packet = decrementTtl(packet);
      this.add({ type: 'ROUTER_DECREMENT_TTL', sender: 'R1', packet, name: `R1 将 TTL 从 ${before} 减为 ${before - 1}`, description: '每转发经过一个路由器，TTL 减 1，同时更新 IPv4 首部校验和。源、目的 IP 均不改变。', highlightLayers: ['ipv4'], highlightFields: ['TTL', 'Header Checksum'], changes: [{ kind: 'router', value: { ipPacket: packet, ttlBefore: before, ttlAfter: before - 1 } }] });
      if (Number(packet.ipv4?.TTL) === 0) { this.fail('R1', 'TTL 已减为 0，R1 必须丢弃该数据包。', '初始 TTL 被设为 1。R1 不会把 TTL=0 的包送往服务器；真实设备通常返回 ICMP Time Exceeded（本故障演示在丢弃点暂停）。', '恢复初始 TTL 64；在真实网络中进一步检查是否存在路由环路。', packet); return; }
      const outSw: DeviceId = reverse ? 'SW1' : 'SW2';
      const outSide = reverse ? 0 : 1;
      this.add({ type: 'ROUTER_RESOLVE_NEXT_HOP', sender: 'R1', packet, name: 'R1 解析出接口的下一跳', description: `出接口 ${this.nic('R1', outSide).name}；目标网络直连，检查 ${this.nic(dst).ip} 的 ARP 映射。`, highlightLayers: ['ipv4'] });
      const savedPhase = this.phase;
      this.arp('R1', dst, outSw, outSide);
      this.phase = savedPhase;
      if (this.stopped) return;
      packet = ethernet(packet, this.nic('R1', outSide), this.nic(dst));
      this.add({ type: 'ROUTER_REENCAPSULATE', sender: 'R1', packet, name: 'R1 重新封装新的以太网帧', description: '源 MAC 换为出接口 MAC，目的 MAC 换为下一跳主机 MAC；端到端 IP 不变，FCS 在发送时重新计算。', highlightLayers: ['ethernet', 'ipv4'], highlightFields: ['Source MAC', 'Destination MAC'], changes: [{ kind: 'router', value: { outgoing: packet } }, this.record(`R1 → ${dst}`, packet)], teacher: 'IP 数据包被装进新的以太网帧。路由器处理收到的帧后重新封装；本实验不考虑 NAT，源 IP 和目的 IP 保持不变。', question: '跨过 R1 后，哪些字段发生了变化？', answer: '两个 MAC 地址、TTL、IPv4 首部校验和和帧 FCS；两个端到端 IP 地址没有变化。' });
      this.add({ type: 'SEND_FRAME', sender: 'R1', receiver: outSw, packet, paths: [['R1', outSw]], name: `R1 → ${outSw}`, description: `新的以太网帧从 ${this.nic('R1', outSide).name} 发出。` });
      this.switchForward(outSw, 'R1', dst, packet);
    }
    this.add({ type: 'DELIVER_TO_HOST', sender: dst, packet, name: `${dst} 接收 ${packet.label}`, description: `校验链路帧并逐层解封装，将 ${packet.protocol} 交给对应协议模块。`, changes: arrivalChanges });
  }
  finish() { this.phase = '实验完成'; this.add({ type: 'COMPLETE', sender: 'PC1', name: '本次实验完成', description: '所有事件已完成。回到任意一步，检查协议字段与设备表项，试着解释每次转发的依据。', teacher: SCENARIOS.find(s => s.id === this.id)!.goal }); }
  result(): Scenario { return { meta: SCENARIOS.find(s => s.id === this.id)!, topology: this.topology, initial: this.initial, events: this.events, fault: this.fault }; }
}

function dnsFlow(b: Builder) {
  b.phase = 'DNS 域名解析';
  b.add({ type: 'CHECK_DNS_CACHE', sender: 'PC1', protocol: 'DNS', name: '检查本地 DNS 缓存', description: `用户输入 ${DOMAIN}；本地没有 A 记录，准备查询 DNS 服务器。` });
  if (b.fault === 'bad-dns') {
    b.add({ type: 'CHECK_DNS_SERVER', sender: 'PC1', protocol: 'DNS', name: '检查已配置的 DNS 地址', description: 'PC1 配置的 DNS 为 192.168.10.99，但教学拓扑中 DNS Server 位于 192.168.10.53。' });
    const missing: Interface = { ...b.nic('DNS'), ip: '192.168.10.99', mac: '00:00:00:00:00:00' };
    const request = arpPacket(b.nic('PC1'), missing);
    b.add({ type: 'SEND_ARP_REQUEST', sender: 'PC1', receiver: 'SW1', packet: request, paths: [['PC1', 'SW1']], broadcast: true, name: '解析错误的 DNS 地址', description: '发送针对 192.168.10.99 的 ARP；尚无法封装 DNS 查询的 UDP 报文。' });
    b.learn('SW1', 'PC1', request); b.flood('SW1', 'PC1', request);
    b.fail('PC1', '错误的 DNS 服务器地址没有 ARP 应答，域名查询无法发出。', 'DNS Server 实际在 192.168.10.53，本地广播内没有 192.168.10.99。', '将客户端 DNS 改为 192.168.10.53；先验证 DNS 服务器可达性，再检查域名记录。', request); return;
  }
  b.subnet('DNS'); b.arp('PC1', 'DNS', 'SW1'); b.phase = 'DNS 域名解析';
  b.add({ type: 'BUILD_DNS_QUERY', sender: 'PC1', protocol: 'DNS', name: '构造 DNS A 记录查询', description: 'UDP 源端口 53000，目的端口 53；向本地 DNS Server 询问域名的 IPv4 地址。', packet: ipPacket('DNS', b.nic('PC1').ip, b.nic('DNS').ip) });
  b.transmit('PC1', 'DNS', ipPacket('DNS', b.nic('PC1').ip, b.nic('DNS').ip));
  b.transmit('DNS', 'PC1', ipPacket('DNS', b.nic('DNS').ip, b.nic('PC1').ip, { reply: true }), [{ kind: 'dns', name: DOMAIN, ip: '192.168.20.100' }]);
  b.add({ type: 'UPDATE_DNS_CACHE', sender: 'PC1', protocol: 'DNS', name: '域名解析完成', description: `${DOMAIN} → 192.168.20.100，缓存 TTL 为 300 秒；现在知道目标 IP，但还没有建立 TCP 连接。` });
}

function prepareRouted(b: Builder) { b.subnet('Server1'); b.arp('PC1', 'R1', 'SW1'); }

function handshake(b: Builder) {
  b.phase = 'TCP 三次握手';
  const pc = b.nic('PC1').ip, server = b.nic('Server1').ip;
  b.add({ type: 'TCP_SEND_SYN', sender: 'PC1', packet: ipPacket('TCP', pc, server, { flags: 'SYN', seq: 1000 }), name: '第一次握手 · SYN', description: '客户端选择初始序号 1000，进入 SYN-SENT。SYN 占用一个序列号。', changes: [{ kind: 'connection', device: 'PC1', value: 'SYN-SENT' }], highlightFields: ['Flags', 'Sequence Number'] });
  b.transmit('PC1', 'Server1', ipPacket('TCP', pc, server, { flags: 'SYN', seq: 1000 }), [{ kind: 'connection', device: 'Server1', value: 'SYN-RECEIVED' }]);
  b.add({ type: 'TCP_SEND_SYN_ACK', sender: 'Server1', packet: ipPacket('TCP', server, pc, { reply: true, flags: 'SYN, ACK', seq: 5000, ack: 1001 }), name: '第二次握手 · SYN-ACK', description: '服务器选择序号 5000，确认号为 1001，表示下一个期望的客户端字节序号。', highlightFields: ['Flags', 'Sequence Number', 'Acknowledgment Number'] });
  b.transmit('Server1', 'PC1', ipPacket('TCP', server, pc, { reply: true, flags: 'SYN, ACK', seq: 5000, ack: 1001 }), [{ kind: 'connection', device: 'PC1', value: 'ESTABLISHED' }]);
  b.add({ type: 'TCP_SEND_ACK', sender: 'PC1', packet: ipPacket('TCP', pc, server, { flags: 'ACK', seq: 1001, ack: 5001 }), name: '第三次握手 · ACK', description: '客户端以 ACK=5001 确认服务器 SYN；纯 ACK 不占用序列号。', highlightFields: ['Flags', 'Acknowledgment Number'] });
  b.transmit('PC1', 'Server1', ipPacket('TCP', pc, server, { flags: 'ACK', seq: 1001, ack: 5001 }), [{ kind: 'connection', device: 'Server1', value: 'ESTABLISHED' }]);
}

function release(b: Builder, pcSeq: number, serverSeq: number) {
  b.phase = 'TCP 连接释放';
  const pc = b.nic('PC1').ip, server = b.nic('Server1').ip;
  const transfers: { src: DeviceId; dst: DeviceId; flags: string; seq: number; ack: number; name: string; description: string; before: Change[]; after: Change[] }[] = [
    { src: 'PC1', dst: 'Server1', flags: 'FIN, ACK', seq: pcSeq, ack: serverSeq, name: '第一次挥手 · 客户端 FIN', description: '客户端已无数据发送，进入 FIN-WAIT-1；服务器收到 FIN 后进入 CLOSE-WAIT。', before: [{ kind: 'connection', device: 'PC1', value: 'FIN-WAIT-1' }], after: [{ kind: 'connection', device: 'Server1', value: 'CLOSE-WAIT' }] },
    { src: 'Server1', dst: 'PC1', flags: 'ACK', seq: serverSeq, ack: pcSeq + 1, name: '第二次挥手 · 服务器 ACK', description: '服务器确认客户端 FIN；客户端进入 FIN-WAIT-2，此时连接仍可单向传输。', before: [], after: [{ kind: 'connection', device: 'PC1', value: 'FIN-WAIT-2' }] },
    { src: 'Server1', dst: 'PC1', flags: 'FIN, ACK', seq: serverSeq, ack: pcSeq + 1, name: '第三次挥手 · 服务器 FIN', description: '服务器也没有数据发送，进入 LAST-ACK；客户端接收 FIN 后进入 TIME-WAIT。', before: [{ kind: 'connection', device: 'Server1', value: 'LAST-ACK' }], after: [{ kind: 'connection', device: 'PC1', value: 'TIME-WAIT' }] },
    { src: 'PC1', dst: 'Server1', flags: 'ACK', seq: pcSeq + 1, ack: serverSeq + 1, name: '第四次挥手 · 客户端 ACK', description: '客户端确认服务器 FIN；服务器进入 CLOSED，客户端继续等待 2MSL。', before: [], after: [{ kind: 'connection', device: 'Server1', value: 'CLOSED' }] },
  ];
  transfers.forEach((t, index) => {
    const packet = ipPacket('TCP', t.src === 'PC1' ? pc : server, t.dst === 'PC1' ? pc : server, { reply: t.src === 'Server1', flags: t.flags, seq: t.seq, ack: t.ack });
    b.add({ type: `TCP_CLOSE_${index + 1}`, sender: t.src, packet, name: t.name, description: t.description, changes: t.before, highlightFields: ['Flags', 'Sequence Number', 'Acknowledgment Number'] });
    b.transmit(t.src, t.dst, packet, t.after);
  });
  b.add({ type: 'TCP_TIME_WAIT', sender: 'PC1', protocol: 'TCP', name: 'TIME-WAIT 结束（教学快进）', description: '等待 2MSL 后客户端进入 CLOSED。本模型用一个事件表示等待，不等同于现实网络计时。', changes: [{ kind: 'connection', device: 'PC1', value: 'CLOSED' }] });
}

function dhcpFlow(b: Builder) {
  b.phase = 'DHCP · DORA';
  ['Discover', 'Offer', 'Request', 'ACK'].forEach((message, i) => {
    const reply = i === 1 || i === 3;
    const src: DeviceId = reply ? 'DHCP' : 'PC1';
    const dst: DeviceId = reply ? 'PC1' : 'DHCP';
    const packet = ethernet(ipPacket('DHCP', reply ? '192.168.1.2' : '0.0.0.0', '255.255.255.255', { reply, dhcp: message }), b.nic(src), BROADCAST);
    b.add({ type: `DHCP_${message.toUpperCase()}`, sender: src, receiver: 'SW1', packet, paths: [[src, 'SW1']], broadcast: true, name: `DHCP ${message}`, description: [
      '客户端尚无地址：0.0.0.0:68 → 255.255.255.255:67，广播寻找 DHCP 服务器。',
      '服务器建议 192.168.1.100/24，提供网关、DNS 与 86400 秒租期。客户端广播标志为 1，因此 Offer 广播发送。',
      '客户端广播 Request，携带所选服务器标识和请求 IP；此时仍不正式应用地址。',
      '服务器广播 ACK，确认此次租约；客户端收到之后再应用配置。',
    ][i], highlightLayers: ['udp', 'application'], highlightFields: ['Source Port', 'Destination Port', 'Message Type', 'yiaddr'] });
    b.learn('SW1', src, packet); b.flood('SW1', src, packet);
    b.add({ type: `DHCP_RECEIVE_${message.toUpperCase()}`, sender: dst, packet, name: `${dst} 收到 ${message}`, description: message === 'Offer' ? 'Offer 只是建议，右侧可查看完整参数；客户端 IPv4 仍未配置。' : message === 'ACK' ? 'ACK 已到达客户端，正式配置 IPv4、子网掩码、默认网关、DNS 和租期。' : `处理 ${message}，核对事务 ID 0x12345678 和客户端 MAC。`, changes: i === 1 ? [{ kind: 'config', value: { status: '收到 Offer · 待确认' } }] : i === 3 ? [{ kind: 'config', value: { ip: '192.168.1.100', mask: '255.255.255.0', gateway: '192.168.1.1', dns: '192.168.1.2', lease: '86400 秒（24 小时）', status: 'BOUND · 已应用' } }] : [] });
  });
}

export function createScenario(id: ScenarioId, fault: FaultId = 'none'): Scenario {
  if (fault !== 'none') id = FAULTS.find(f => f.id === fault)!.scenario;
  const b = new Builder(id, fault);
  if (id === 'dhcp') dhcpFlow(b);
  else if (id === 'dns' || id === 'web') {
    dnsFlow(b);
    if (id === 'web') {
      prepareRouted(b); handshake(b); b.phase = 'HTTP 请求与响应';
      b.add({ type: 'HTTP_GET', sender: 'PC1', protocol: 'HTTP', name: '浏览器构造 HTTP GET', description: `向 ${DOMAIN} 请求首页。${byteLength(GET_BODY)} 字节应用数据通过已建立的 TCP 连接传输。`, packet: ipPacket('HTTP', b.nic('PC1').ip, b.nic('Server1').ip, { flags: 'PSH, ACK', payload: GET_BODY }) });
      b.transmit('PC1', 'Server1', ipPacket('HTTP', b.nic('PC1').ip, b.nic('Server1').ip, { flags: 'PSH, ACK', seq: 1001, ack: 5001, payload: GET_BODY }));
      b.transmit('Server1', 'PC1', ipPacket('HTTP', b.nic('Server1').ip, b.nic('PC1').ip, { reply: true, flags: 'PSH, ACK', seq: 5001, ack: 1001 + byteLength(GET_BODY), payload: RESPONSE_BODY }));
      b.transmit('PC1', 'Server1', ipPacket('TCP', b.nic('PC1').ip, b.nic('Server1').ip, { seq: 1001 + byteLength(GET_BODY), ack: 5001 + byteLength(RESPONSE_BODY) }));
      release(b, 1001 + byteLength(GET_BODY), 5001 + byteLength(RESPONSE_BODY));
    }
  } else if (id === 'tcp-open' || id === 'tcp-close') {
    prepareRouted(b); handshake(b);
    if (id === 'tcp-close') release(b, 1001, 5001);
  } else {
    const routed = id === 'routed-ping';
    b.subnet(routed ? 'Server1' : 'PC2');
    b.arp('PC1', routed ? 'R1' : 'PC2', 'SW1');
    if (id !== 'arp') {
      b.phase = 'ICMP 请求与应答';
      const dst: DeviceId = routed ? 'Server1' : 'PC2';
      const request = ipPacket('ICMP', b.nic('PC1').ip, b.nic(dst).ip, { ttl: fault === 'ttl' ? 1 : 64 });
      b.add({ type: 'BUILD_ICMP_REQUEST', sender: 'PC1', packet: request, name: '构造 ICMP Echo Request', description: 'Type=8，Code=0；Identifier=0x0042，Sequence=1。ICMP 被装入 IPv4 数据包。', highlightFields: ['Type', 'Destination IP'] });
      b.transmit('PC1', dst, request);
      const reply = ipPacket('ICMP', b.nic(dst).ip, b.nic('PC1').ip, { reply: true });
      b.add({ type: 'BUILD_REPLY', sender: dst, packet: reply, name: '构造 ICMP Echo Reply', description: 'Type 改为 0；Identifier、Sequence 和回显数据保持一致。源、目的 IP 交换，应答是新的 IP 数据包，初始 TTL=64。', highlightFields: ['Type', 'Source IP', 'Destination IP'] });
      b.transmit(dst, 'PC1', reply);
    }
  }
  b.finish();
  return b.result();
}

export const SCENARIO_COUNTS = Object.fromEntries(SCENARIOS.map(s => [s.id, createScenario(s.id).events.length])) as Record<ScenarioId, number>;
