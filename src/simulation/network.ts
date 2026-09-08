import type { Device, DeviceId, Interface, Packet, Protocol, ScenarioId, SimulationState, Topology } from './types';

export const BROADCAST = 'FF:FF:FF:FF:FF:FF';
export const DOMAIN = 'www.example.test';
export const GET_BODY = 'GET / HTTP/1.1\r\nHost: www.example.test\r\n\r\n';
export const RESPONSE_BODY = 'HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, class!';
export const byteLength = (text: string) => new TextEncoder().encode(text).length;
const nic = (name: string, ip: string, mac: string): Interface => ({ name, ip, mac, prefix: 24, vlan: 1, up: true });

export function createTopology(id: ScenarioId): Topology {
  const routed = ['routed-ping', 'web', 'dns', 'tcp-open', 'tcp-close'].includes(id);
  const network = routed ? '192.168.10.' : '192.168.1.';
  const devices: Device[] = [
    { id: 'PC1', name: 'PC1', type: 'pc', x: routed ? 85 : 130, y: 210, interfaces: [nic('eth0', id === 'dhcp' ? '0.0.0.0' : network + '10', '02:00:00:00:01:10')], gateway: network + '1' },
    { id: 'SW1', name: 'SW1', type: 'switch', x: routed ? 255 : 395, y: 210, interfaces: [nic('GE0/1', '无（三层地址不参与转发）', '02:00:00:00:AA:01')] },
    { id: 'R1', name: 'R1', type: 'router', x: routed ? 425 : 660, y: routed ? 210 : 365, interfaces: [nic('GE0/0/0', network + '1', '02:00:00:00:10:01'), nic('GE0/0/1', '192.168.20.1', '02:00:00:00:20:01')] },
  ];
  const links: Topology['links'] = [{ a: 'PC1', b: 'SW1', aPort: 'eth0', bPort: 'GE0/1' }, { a: 'SW1', b: 'R1', aPort: 'GE0/2', bPort: 'GE0/0/0' }];
  if (routed) {
    devices.push(
      { id: 'SW2', name: 'SW2', type: 'switch', x: 595, y: 210, interfaces: [nic('GE0/1', '无（三层地址不参与转发）', '02:00:00:00:AA:02')] },
      { id: 'Server1', name: 'Server1', type: 'server', x: 765, y: 210, interfaces: [nic('eth0', '192.168.20.100', '02:00:00:00:02:64')], gateway: '192.168.20.1' },
      { id: 'PC2', name: 'PC2', type: 'pc', x: 255, y: 360, interfaces: [nic('eth0', '192.168.10.20', '02:00:00:00:01:20')], gateway: network + '1' },
    );
    links.push({ a: 'R1', b: 'SW2', aPort: 'GE0/0/1', bPort: 'GE0/1' }, { a: 'SW2', b: 'Server1', aPort: 'GE0/2', bPort: 'eth0' }, { a: 'SW1', b: 'PC2', aPort: 'GE0/3', bPort: 'eth0' });
    if (['dns', 'web'].includes(id)) {
      devices.push({ id: 'DNS', name: 'DNS Server', type: 'server', x: 255, y: 62, interfaces: [nic('eth0', '192.168.10.53', '02:00:00:00:01:53')] });
      links.push({ a: 'SW1', b: 'DNS', aPort: 'GE0/4', bPort: 'eth0' });
    }
  } else {
    devices.push({ id: 'PC2', name: 'PC2', type: 'pc', x: 660, y: 210, interfaces: [nic('eth0', network + '20', '02:00:00:00:01:20')], gateway: network + '1' });
    links.push({ a: 'SW1', b: 'PC2', aPort: 'GE0/3', bPort: 'eth0' });
    if (id === 'dhcp') {
      devices.push({ id: 'DHCP', name: 'DHCP Server', type: 'server', x: 395, y: 62, interfaces: [nic('eth0', '192.168.1.2', '02:00:00:00:01:02')] });
      links.push({ a: 'SW1', b: 'DHCP', aPort: 'GE0/4', bPort: 'eth0' });
    }
  }
  for (const device of devices.filter(d => d.type === 'switch')) {
    const connectedPorts = links.filter(l => l.a === device.id || l.b === device.id).map(l => l.a === device.id ? l.aPort : l.bPort);
    device.interfaces = connectedPorts.map(name => ({ ...device.interfaces[0], name }));
  }
  return { devices, links, routed };
}
export function getDevice(topology: Topology, id: DeviceId): Device { return topology.devices.find(d => d.id === id)!; }
export function getInterface(topology: Topology, id: DeviceId, side = 0): Interface { return getDevice(topology, id).interfaces[side]; }
export function portTo(topology: Topology, device: DeviceId, neighbor: DeviceId): string {
  const link = topology.links.find(l => (l.a === device && l.b === neighbor) || (l.b === device && l.a === neighbor));
  return !link ? '无接口' : link.a === device ? link.aPort : link.bPort;
}
export function neighbors(topology: Topology, device: DeviceId): DeviceId[] {
  return topology.links.filter(l => l.a === device || l.b === device).map(l => l.a === device ? l.b : l.a);
}
export function initialState(topology: Topology, id: ScenarioId): SimulationState {
  const pc = getInterface(topology, 'PC1');
  return {
    macTables: { SW1: [], SW2: [] }, arpCaches: Object.fromEntries(topology.devices.filter(d => d.type !== 'switch').map(d => [d.id, []])),
    routes: [
      { network: topology.routed ? '192.168.10.0' : '192.168.1.0', prefix: 24, nextHop: '直连', iface: 'GE0/0/0', type: 'Direct' },
      { network: '192.168.20.0', prefix: 24, nextHop: '直连', iface: 'GE0/0/1', type: 'Direct' },
    ],
    statuses: Object.fromEntries(topology.devices.map(d => [d.id, '就绪'])), dnsCache: {}, connections: { PC1: 'CLOSED', Server1: 'LISTEN' }, addresses: [], routerView: {},
    config: { ip: pc.ip, mask: id === 'dhcp' ? '未配置' : '255.255.255.0', gateway: id === 'dhcp' ? '未配置' : getDevice(topology, 'PC1').gateway!, dns: id === 'dhcp' ? '未配置' : '192.168.10.53', lease: id === 'dhcp' ? '未配置' : '静态配置', status: id === 'dhcp' ? '未配置' : '静态配置' },
  };
}

/** RFC 791 header checksum over a fixed 20-byte, unfragmented teaching IPv4 header. */
export function ipChecksum(src: string, dst: string, ttl: number, protocol: number, length: number): string {
  const octets = [...src.split('.'), ...dst.split('.')].map(Number);
  const words = [0x4500, length, 0x1234, 0x4000, ttl * 256 + protocol, 0, octets[0] * 256 + octets[1], octets[2] * 256 + octets[3], octets[4] * 256 + octets[5], octets[6] * 256 + octets[7]];
  let sum = words.reduce((a, b) => a + b, 0);
  while (sum >>> 16) sum = (sum & 0xffff) + (sum >>> 16);
  return '0x' + ((~sum) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
export function ethernet(packet: Packet, src: Interface, dst: Interface | string): Packet {
  return { ...structuredClone(packet), ethernet: { 'Destination MAC': typeof dst === 'string' ? dst : dst.mac, 'Source MAC': src.mac, EtherType: packet.arp ? '0x0806 (ARP)' : '0x0800 (IPv4)', Payload: packet.arp ? 'ARP · 28 bytes（另有以太网填充）' : `IPv4 · ${packet.ipv4?.['Total Length']} bytes`, FCS: '发送接口重新计算 CRC-32；此处不生成真实帧字节' } };
}
export function arpPacket(src: Interface, dst: Interface, reply = false): Packet {
  const packet: Packet = { protocol: 'ARP', label: reply ? 'ARP Reply' : 'ARP Request', arp: {
    Operation: reply ? '2 · Reply' : '1 · Request', 'Sender MAC': src.mac, 'Sender IP': src.ip,
    'Target MAC': reply ? dst.mac : '00:00:00:00:00:00', 'Target IP': dst.ip,
  } };
  return ethernet(packet, src, reply ? dst : BROADCAST);
}
export function ipPacket(protocol: Protocol, src: string, dst: string, options: { reply?: boolean; flags?: string; seq?: number; ack?: number; payload?: string; ttl?: number; dhcp?: string } = {}): Packet {
  const { reply = false, flags = 'ACK', seq = 1001, ack = 5001, payload = '', ttl = 64, dhcp = '' } = options;
  const packet: Packet = { protocol, label: protocol };
  let length = 20;
  let ipProtocol = 6;
  if (protocol === 'ICMP') {
    packet.label = reply ? 'ICMP Reply' : 'ICMP Request';
    packet.icmp = { Type: reply ? '0 · Echo Reply' : '8 · Echo Request', Code: 0, Identifier: '0x0042', 'Sequence Number': 1, Payload: '32 bytes · 教学回显数据' };
    length += 40; ipProtocol = 1;
  } else if (protocol === 'TCP' || protocol === 'HTTP') {
    packet.label = protocol === 'HTTP' ? reply ? 'HTTP 200' : 'HTTP GET' : `TCP ${flags}`;
    packet.tcp = { 'Source Port': reply ? 80 : 49152, 'Destination Port': reply ? 49152 : 80, 'Sequence Number': seq, 'Acknowledgment Number': flags === 'SYN' ? 0 : ack, Flags: flags, Window: 64240, Payload: `${byteLength(payload)} bytes`, 'Header Length': '20 bytes（不含选项）' };
    if (protocol === 'HTTP') packet.application = { Protocol: 'HTTP/1.1', Message: payload, 'Payload Bytes': byteLength(payload) };
    length += 20 + byteLength(payload);
  } else {
    ipProtocol = 17;
    const dnsLength = reply ? 50 : 34; // QNAME 18 bytes + DNS header 12 + type/class 4; response adds 16-byte A RR.
    const udpLength = 8 + (protocol === 'DHCP' ? 300 : dnsLength);
    packet.udp = { 'Source Port': protocol === 'DHCP' ? reply ? 67 : 68 : reply ? 53 : 53000, 'Destination Port': protocol === 'DHCP' ? reply ? 68 : 67 : reply ? 53000 : 53, Length: udpLength, Checksum: '0x0000（IPv4 UDP 中可选，本模型未启用）' };
    length += udpLength;
    if (protocol === 'DNS') {
      packet.label = reply ? 'DNS Answer' : 'DNS Query';
      packet.application = { Protocol: 'DNS', 'Transaction ID': '0xCAFE', QR: reply ? '1 · Response' : '0 · Query', QNAME: DOMAIN, QTYPE: 'A (IPv4)', ...(reply ? { Answer: '192.168.20.100', 'DNS TTL': '300 seconds（与 IP TTL 无关）' } : {}) };
    } else {
      packet.label = `DHCP ${dhcp}`;
      packet.application = { Protocol: 'DHCP', 'Message Type': dhcp, xid: '0x12345678', ciaddr: '0.0.0.0', yiaddr: reply ? '192.168.1.100' : '0.0.0.0', chaddr: '02:00:00:00:01:10', Flags: '0x8000 · Broadcast', ...(dhcp !== 'Discover' ? { 'Server Identifier': '192.168.1.2' } : {}), ...(dhcp === 'Request' ? { 'Requested IP': '192.168.1.100' } : {}), ...(reply ? { 'Subnet Mask': '255.255.255.0', Router: '192.168.1.1', DNS: '192.168.1.2', Lease: '86400 seconds' } : {}), 'Payload Length': '300 bytes（固定教学选项与填充）' };
    }
  }
  packet.ipv4 = { Version: 4, 'Header Length': '20 bytes (IHL = 5)', 'Total Length': length, TTL: ttl, Protocol: `${ipProtocol} (${ipProtocol === 1 ? 'ICMP' : ipProtocol === 6 ? 'TCP' : 'UDP'})`, 'Header Checksum': ipChecksum(src, dst, ttl, ipProtocol, length), 'Source IP': src, 'Destination IP': dst, Identification: '0x1234', Flags: 'DF=1 · 不分片' };
  return packet;
}
export function decrementTtl(packet: Packet): Packet {
  const result = structuredClone(packet);
  if (!result.ipv4) return result;
  result.ipv4.TTL = Number(result.ipv4.TTL) - 1;
  result.ipv4['Header Checksum'] = ipChecksum(String(result.ipv4['Source IP']), String(result.ipv4['Destination IP']), Number(result.ipv4.TTL), parseInt(String(result.ipv4.Protocol)), Number(result.ipv4['Total Length']));
  return result;
}
