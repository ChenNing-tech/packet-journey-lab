import { describe, expect, it } from 'vitest';
import { advancePlayback, applyChanges, clone, compileSnapshots, initialPlayback, ipv4Number, longestPrefixMatch, sameSubnet, stateAt } from './engine';
import { byteLength, BROADCAST, GET_BODY, ipChecksum, RESPONSE_BODY } from './network';
import { createScenario, FAULTS, SCENARIOS } from './scenarios';
import type { LabEvent, Packet } from './types';

const indexOf = (events: LabEvent[], type: string) => events.findIndex(e => e.type === type);
const wirePackets = (events: LabEvent[]) => events.filter(e => e.type === 'SEND_FRAME' && e.paths.length && e.packet?.ipv4).map(e => e.packet!);

describe('确定性事件引擎与时间线', () => {
  it.each(SCENARIOS)('$title 的每个步骤都可从初始状态准确重建', meta => {
    const scenario = createScenario(meta.id), snapshots = compileSnapshots(scenario);
    let sequential = clone(scenario.initial);
    scenario.events.forEach((event, index) => {
      expect(event.index).toBe(index);
      expect(event.scenarioId).toBe(meta.id);
      expect(event.teacher.length).toBeGreaterThan(0);
      expect(event.question.length).toBeGreaterThan(0);
      sequential = applyChanges(sequential, event.changes);
      expect(stateAt(scenario, index)).toEqual(sequential);
      expect(snapshots[index]).toEqual(sequential);
    });
    expect(scenario.events.at(-1)?.type).toBe('COMPLETE');
    expect(createScenario(meta.id)).toEqual(scenario);
    expect(stateAt(scenario, -1)).toEqual(scenario.initial);
  });
  it('向后跳转会移除未来 MAC / ARP 表项，且快照不会相互污染', () => {
    const scenario = createScenario('routed-ping');
    const snapshots = compileSnapshots(scenario);
    const end = stateAt(scenario, 99999);
    expect(end.macTables.SW2!.length).toBeGreaterThan(0);
    expect(end.arpCaches.R1!.length).toBeGreaterThan(0);
    const first = stateAt(scenario, 0);
    expect(first.macTables.SW2).toEqual([]);
    expect(first.arpCaches.R1).toEqual([]);
    expect(first.addresses).toEqual([]);
    end.macTables.SW2!.push({ mac: 'test', port: 'x', vlan: 1, type: 'test', age: '0' });
    expect(snapshots.at(-1)?.macTables.SW2?.some(r => r.mac === 'test')).toBe(false);
    expect(scenario.initial.macTables.SW2).toEqual([]);
  });
  it('播放 / 暂停 / 单步 / 倍速 / 重播 / 结束 / 重置行为一致', () => {
    const events = createScenario('lan-ping').events;
    let p = advancePlayback(initialPlayback, { type: 'PLAY' }, events);
    p = advancePlayback(p, { type: 'TICK', delta: 600 }, events);
    expect(p.progress).toBe(.25);
    p = advancePlayback(p, { type: 'PAUSE' }, events);
    expect(advancePlayback(p, { type: 'TICK', delta: 3000 }, events)).toEqual(p);
    p = advancePlayback(p, { type: 'NEXT' }, events);
    expect(p).toMatchObject({ index: 1, progress: 1, playing: false });
    p = advancePlayback(p, { type: 'PREVIOUS' }, events);
    expect(p.index).toBe(0);
    p = advancePlayback(p, { type: 'REPLAY' }, events);
    p = advancePlayback(p, { type: 'SPEED', speed: 2 }, events);
    p = advancePlayback(p, { type: 'TICK', delta: 1200 }, events);
    expect(p).toMatchObject({ index: 0, progress: 1, playing: false });
    p = advancePlayback(p, { type: 'SEEK', index: 99999 }, events);
    expect(p.index).toBe(events.length - 1);
    p = advancePlayback(p, { type: 'PLAY' }, events);
    expect(p).toMatchObject({ index: 0, playing: true });
    p = advancePlayback(p, { type: 'RESET' }, events);
    expect(p).toMatchObject({ index: 0, progress: 0, playing: false, speed: 2 });
  });
  it('自然播放走完后停止，不能越过事件列表', () => {
    const events = createScenario('arp').events;
    let p = advancePlayback(initialPlayback, { type: 'PLAY' }, events);
    for (let i = 0; i < events.length + 3; i++) p = advancePlayback(p, { type: 'TICK', delta: 2500 }, events);
    expect(p).toMatchObject({ index: events.length - 1, progress: 1, playing: false });
  });
});

describe('ARP、交换机学习与同网段 Ping', () => {
  it('流程先判断网段，再 ARP Request / Reply，最后 ICMP Request / Reply', () => {
    const scenario = createScenario('lan-ping');
    const types = ['CHECK_LOCAL_SUBNET', 'CHECK_ARP_CACHE', 'SEND_ARP_REQUEST', 'SWITCH_LEARN_SOURCE_MAC', 'SWITCH_FLOOD_BROADCAST', 'HANDLE_ARP_REQUEST', 'SEND_ARP_REPLY', 'UPDATE_ARP_CACHE', 'BUILD_ICMP_REQUEST', 'BUILD_REPLY', 'COMPLETE'];
    const indices = types.map(t => indexOf(scenario.events, t));
    expect(indices.every(i => i >= 0)).toBe(true);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    const request = scenario.events.find(e => e.type === 'SEND_ARP_REQUEST')!.packet!;
    const reply = scenario.events.find(e => e.type === 'SEND_ARP_REPLY')!.packet!;
    expect(request.ethernet?.['Destination MAC']).toBe(BROADCAST);
    expect(request.arp?.['Target MAC']).toBe('00:00:00:00:00:00');
    expect(request.ipv4).toBeUndefined();
    expect(reply.ethernet?.['Destination MAC']).toBe(request.ethernet?.['Source MAC']);
    const complete = stateAt(scenario, 99999);
    expect(complete.macTables.SW1).toHaveLength(2);
    expect(complete.macTables.SW1).toEqual(expect.arrayContaining([expect.objectContaining({ mac: '02:00:00:00:01:10', port: 'GE0/1' }), expect.objectContaining({ mac: '02:00:00:00:01:20', port: 'GE0/3' })]));
    expect(complete.arpCaches.PC1).toContainEqual(expect.objectContaining({ ip: '192.168.1.20', mac: '02:00:00:00:01:20' }));
    expect(complete.arpCaches.PC2).toContainEqual(expect.objectContaining({ ip: '192.168.1.10', mac: '02:00:00:00:01:10' }));
    const echo = scenario.events.filter(e => e.type === 'DELIVER_TO_HOST' && e.protocol === 'ICMP');
    expect(echo.map(e => e.receiver)).toEqual(['PC2', 'PC1']);
    expect(echo.map(e => e.packet?.icmp?.Type)).toEqual(['8 · Echo Request', '0 · Echo Reply']);
    expect(echo[0].packet?.icmp?.Identifier).toBe(echo[1].packet?.icmp?.Identifier);
    expect(wirePackets(scenario.events).every(p => p.ipv4?.TTL === 64)).toBe(true);
  });
  it.each(SCENARIOS)('$title 广播不返回入端口、不穿过路由器，且路径都属于拓扑链路', meta => {
    const scenario = createScenario(meta.id);
    scenario.events.forEach(event => {
      event.paths.forEach(path => path.slice(1).forEach((id, i) => expect(scenario.topology.links.some(l => (l.a === id && l.b === path[i]) || (l.b === id && l.a === path[i]))).toBe(true)));
      if (event.type === 'SWITCH_FLOOD_BROADCAST') {
        expect(event.egress).not.toContain(event.ingress);
        expect(event.paths.every(path => path[0] === 'SW1' || path[0] === 'SW2')).toBe(true);
        expect(event.paths.every(path => path.length === 2)).toBe(true);
      }
      if (event.type === 'SWITCH_LEARN_SOURCE_MAC') {
        const change = event.changes.find(c => c.kind === 'learn');
        if (change?.kind === 'learn') expect(change.entry.mac).toBe(event.packet?.ethernet?.['Source MAC']);
      }
    });
    const r1Broadcasts = scenario.events.filter(e => e.sender === 'R1' && e.paths.length && e.packet?.ethernet?.['Destination MAC'] === BROADCAST);
    expect(r1Broadcasts.every(e => e.type === 'SEND_ARP_REQUEST' && e.packet?.arp?.['Sender IP'] === '192.168.20.1')).toBe(true);
  });
  it('所有正常交换机单播转发保持 MAC / IP / TTL 不变', () => {
    for (const meta of SCENARIOS) {
      const events = createScenario(meta.id).events;
      events.forEach((event, i) => {
        if (event.type === 'SWITCH_LOOKUP_MAC') {
          expect(events[i - 1].type).toBe('SWITCH_LEARN_SOURCE_MAC');
          expect(events[i + 1].packet).toEqual(event.packet);
          expect(event.packet).toEqual(events[i - 1].packet);
        }
      });
    }
  });
});

describe('三层转发、字段一致性与校验和', () => {
  it('支持按掩码判断与最长前缀匹配', () => {
    expect(sameSubnet('192.168.10.10', '192.168.20.100', 24)).toBe(false);
    expect(sameSubnet('192.168.10.10', '192.168.20.100', 16)).toBe(true);
    const routes = [0, 16, 24].map(prefix => ({ network: prefix === 24 ? '192.168.20.0' : prefix === 16 ? '192.168.0.0' : '0.0.0.0', prefix, iface: `${prefix}`, nextHop: 'x', type: 'test' }));
    expect(longestPrefixMatch('192.168.20.100', routes)?.prefix).toBe(24);
    expect(longestPrefixMatch('10.0.0.1', routes)?.prefix).toBe(0);
    expect(longestPrefixMatch('10.0.0.1', routes.slice(1))).toBeUndefined();
    expect(ipv4Number('255.255.255.255')).toBe(4294967295);
  });
  it('跨网段 Ping 往返都重新封装 MAC，IP 保持端到端且 TTL 每次只减 1', () => {
    const scenario = createScenario('routed-ping');
    const rows = stateAt(scenario, 99999).addresses;
    expect(rows).toHaveLength(4);
    for (const pair of [[rows[0], rows[1]], [rows[2], rows[3]]]) {
      expect(pair[0].srcMac).not.toBe(pair[1].srcMac);
      expect(pair[0].dstMac).not.toBe(pair[1].dstMac);
      expect(pair[0].srcIp).toBe(pair[1].srcIp);
      expect(pair[0].dstIp).toBe(pair[1].dstIp);
      expect(pair[0].ttl).toBe(64);
      expect(pair[1].ttl).toBe(63);
    }
    expect(rows[0].dstMac).toBe('02:00:00:00:10:01');
    expect(rows[0].dstIp).toBe('192.168.20.100');
    expect(rows[1].srcMac).toBe('02:00:00:00:20:01');
    expect(rows[1].dstMac).toBe('02:00:00:00:02:64');
    const decaps = scenario.events.filter(e => e.type === 'ROUTER_DECAPSULATE');
    expect(decaps).toHaveLength(2);
    expect(decaps.every(e => !e.packet?.ethernet && e.packet?.ipv4)).toBe(true);
    const ttlEvents = scenario.events.filter(e => e.type === 'ROUTER_DECREMENT_TTL');
    expect(ttlEvents).toHaveLength(2);
    expect(ttlEvents.every(e => e.packet?.ipv4?.TTL === 63)).toBe(true);
    expect(ttlEvents[0].packet?.ipv4?.['Header Checksum']).not.toBe(decaps[0].packet?.ipv4?.['Header Checksum']);
  });
  it.each(SCENARIOS)('$title 每个 IP 报文的长度、校验和与上层载荷一致', meta => {
    createScenario(meta.id).events.forEach(event => {
      const packet = event.packet;
      if (!packet?.ipv4) return;
      const ip = packet.ipv4;
      expect(ip['Header Checksum']).toBe(ipChecksum(String(ip['Source IP']), String(ip['Destination IP']), Number(ip.TTL), parseInt(String(ip.Protocol)), Number(ip['Total Length'])));
      if (packet.tcp) expect(ip['Total Length']).toBe(40 + Number.parseInt(String(packet.tcp.Payload)));
      if (packet.udp) expect(ip['Total Length']).toBe(20 + Number(packet.udp.Length));
      if (packet.icmp) { expect(ip['Total Length']).toBe(60); expect(packet.tcp).toBeUndefined(); expect(packet.udp).toBeUndefined(); }
    });
  });
  it('IPv4 首部校验和符合独立的已知字节向量', () => {
    // Known fixed header: 45 00 00 3c 12 34 40 00 40 01 88 ce c0 a8 0a 0a c0 a8 14 64.
    expect(ipChecksum('192.168.10.10', '192.168.20.100', 64, 1, 60)).toBe('0x88CE');
  });
});

describe('TCP、DNS、HTTP 与 DHCP', () => {
  it('握手为 SYN → SYN-ACK → ACK，并在接收后更新连接状态', () => {
    const scenario = createScenario('tcp-open');
    const steps = scenario.events.filter(e => ['TCP_SEND_SYN', 'TCP_SEND_SYN_ACK', 'TCP_SEND_ACK'].includes(e.type));
    expect(steps.map(e => e.packet?.tcp?.Flags)).toEqual(['SYN', 'SYN, ACK', 'ACK']);
    expect(steps.map(e => [e.packet?.tcp?.['Sequence Number'], e.packet?.tcp?.['Acknowledgment Number']])).toEqual([[1000, 0], [5000, 1001], [1001, 5001]]);
    expect(stateAt(scenario, 99999).connections).toEqual({ PC1: 'ESTABLISHED', Server1: 'ESTABLISHED' });
  });
  it('释放包含四次挥手、半关闭与显式快进的 TIME-WAIT', () => {
    const scenario = createScenario('tcp-close');
    const steps = scenario.events.filter(e => /^TCP_CLOSE_/.test(e.type));
    expect(steps.map(e => e.packet?.tcp?.Flags)).toEqual(['FIN, ACK', 'ACK', 'FIN, ACK', 'ACK']);
    expect(steps.map(e => [e.packet?.tcp?.['Sequence Number'], e.packet?.tcp?.['Acknowledgment Number']])).toEqual([[1001,5001],[5001,1002],[5001,1002],[1002,5002]]);
    expect(stateAt(scenario, steps[2].index).connections).toEqual({ PC1: 'FIN-WAIT-2', Server1: 'LAST-ACK' });
    expect(stateAt(scenario, steps[3].index).connections.PC1).toBe('TIME-WAIT');
    expect(stateAt(scenario, 99999).connections).toEqual({ PC1: 'CLOSED', Server1: 'CLOSED' });
  });
  it('DNS 经 UDP 53 查询，缓存到达后才写入，ARP 不带 IP 头', () => {
    const scenario = createScenario('dns');
    const query = scenario.events.find(e => e.type === 'BUILD_DNS_QUERY')!;
    expect(query.packet?.udp?.['Destination Port']).toBe(53);
    expect(stateAt(scenario, query.index).dnsCache).toEqual({});
    expect(stateAt(scenario, 99999).dnsCache).toEqual({ 'www.example.test': '192.168.20.100' });
    expect(scenario.events.filter(e => e.protocol === 'ARP').every(e => !e.packet?.ipv4)).toBe(true);
  });
  it('Web 载荷字节数推进序列号，ACK 与 FIN 前后连贯', () => {
    const scenario = createScenario('web');
    expect(indexOf(scenario.events, 'UPDATE_DNS_CACHE')).toBeLessThan(indexOf(scenario.events, 'TCP_SEND_SYN'));
    expect(indexOf(scenario.events, 'TCP_SEND_ACK')).toBeLessThan(indexOf(scenario.events, 'HTTP_GET'));
    const received = scenario.events.filter(e => e.type === 'DELIVER_TO_HOST' && e.protocol === 'HTTP').map(e => e.packet as Packet);
    expect(received).toHaveLength(2);
    expect(received[0].tcp?.['Sequence Number']).toBe(1001);
    expect(received[1].tcp?.['Acknowledgment Number']).toBe(1001 + byteLength(GET_BODY));
    expect(received[1].tcp?.['Sequence Number']).toBe(5001);
    const fin = scenario.events.find(e => e.type === 'TCP_CLOSE_1')!.packet!;
    expect(fin.tcp?.['Sequence Number']).toBe(1001 + byteLength(GET_BODY));
    expect(fin.tcp?.['Acknowledgment Number']).toBe(5001 + byteLength(RESPONSE_BODY));
  });
  it('DHCP DORA 顺序、广播方向、UDP 端口、ACK 生效时间都正确', () => {
    const scenario = createScenario('dhcp');
    const steps = scenario.events.filter(e => ['DHCP_DISCOVER', 'DHCP_OFFER', 'DHCP_REQUEST', 'DHCP_ACK'].includes(e.type));
    expect(steps.map(e => e.packet?.application?.['Message Type'])).toEqual(['Discover', 'Offer', 'Request', 'ACK']);
    expect(steps.map(e => [e.packet?.udp?.['Source Port'], e.packet?.udp?.['Destination Port']])).toEqual([[68,67],[67,68],[68,67],[67,68]]);
    expect(steps.every(e => e.packet?.ethernet?.['Destination MAC'] === BROADCAST)).toBe(true);
    expect(steps.every(e => e.packet?.ipv4?.['Destination IP'] === '255.255.255.255')).toBe(true);
    expect(stateAt(scenario, steps[3].index).config.ip).toBe('0.0.0.0');
    expect(stateAt(scenario, 99999).config).toEqual({ ip: '192.168.1.100', mask: '255.255.255.0', gateway: '192.168.1.1', dns: '192.168.1.2', lease: '86400 秒（24 小时）', status: 'BOUND · 已应用' });
  });
});

describe('故障演示在最早可定位的失败处停止', () => {
  const expectedDevices = { 'bad-subnet': 'PC1', 'no-gateway': 'PC1', 'bad-gateway': 'PC1', 'host-off': 'Server1', 'switch-off': 'SW1', 'router-off': 'R1', 'no-route': 'R1', vlan: 'SW1', 'bad-dns': 'PC1', ttl: 'R1' };
  it.each(FAULTS.filter(f => f.id !== 'none'))('$title 不会继续成功传输', fault => {
    const scenario = createScenario(fault.scenario, fault.id);
    const failure = scenario.events.at(-1)!;
    expect(failure.type).toBe('FAILURE');
    expect(failure.receiver).toBe(expectedDevices[fault.id as keyof typeof expectedDevices]);
    expect(failure.failure?.diagnosis.length).toBeGreaterThan(10);
    expect(failure.failure?.fix.length).toBeGreaterThan(5);
    expect(scenario.events.filter(e => e.failure)).toHaveLength(1);
    let p = advancePlayback(initialPlayback, { type: 'PLAY' }, scenario.events);
    for (let i = 0; i < scenario.events.length + 5; i++) p = advancePlayback(p, { type: 'TICK', delta: 3000 }, scenario.events);
    expect(p.playing).toBe(false);
    expect(p.index).toBe(scenario.events.length - 1);
    expect(advancePlayback(p, { type: 'PLAY' }, scenario.events).playing).toBe(false);
    expect(scenario.events.some(e => e.type === 'COMPLETE')).toBe(false);
  });
  it('TTL=0 不重新封装；缺路由不查目标 ARP；关闭交换机不学习源 MAC', () => {
    const ttl = createScenario('routed-ping', 'ttl');
    expect(ttl.events.at(-1)?.packet?.ipv4?.TTL).toBe(0);
    expect(ttl.events.some(e => e.type === 'ROUTER_REENCAPSULATE')).toBe(false);
    const missing = createScenario('routed-ping', 'no-route');
    expect(stateAt(missing, 99999).arpCaches.R1?.some(e => e.ip === '192.168.20.100')).toBe(false);
    const down = createScenario('routed-ping', 'switch-off');
    expect(stateAt(down, 99999).macTables.SW1).toEqual([]);
    const vlan = createScenario('lan-ping', 'vlan');
    expect(vlan.events.filter(e => e.type === 'SWITCH_FLOOD_BROADCAST').every(e => e.paths.every(path => !path.includes('PC2')))).toBe(true);
  });
});
