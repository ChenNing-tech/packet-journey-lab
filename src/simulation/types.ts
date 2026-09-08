export type Protocol = 'SYSTEM' | 'ARP' | 'ICMP' | 'TCP' | 'UDP' | 'DNS' | 'DHCP' | 'HTTP';
export type DeviceId = 'PC1' | 'PC2' | 'SW1' | 'R1' | 'SW2' | 'Server1' | 'DNS' | 'DHCP';
export type ScenarioId = 'lan-ping' | 'routed-ping' | 'arp' | 'web' | 'dns' | 'dhcp' | 'tcp-open' | 'tcp-close';
export type FaultId = 'none' | 'bad-subnet' | 'no-gateway' | 'bad-gateway' | 'host-off' | 'switch-off' | 'router-off' | 'no-route' | 'vlan' | 'bad-dns' | 'ttl';
export type Fields = Record<string, string | number>;
export interface Interface { name: string; ip: string; mac: string; prefix: number; vlan: number; up: boolean }
export interface Device { id: DeviceId; name: string; type: 'pc' | 'switch' | 'router' | 'server'; x: number; y: number; interfaces: Interface[]; gateway?: string; }
export interface Link { a: DeviceId; b: DeviceId; aPort: string; bPort: string; }
export interface Topology { devices: Device[]; links: Link[]; routed: boolean; }
export interface Packet { label: string; protocol: Protocol; ethernet?: Fields; ipv4?: Fields; arp?: Fields; icmp?: Fields; tcp?: Fields; udp?: Fields; application?: Fields; }
export interface MacEntry { mac: string; port: string; vlan: number; type: string; age: string }
export interface ArpEntry { ip: string; mac: string; iface: string; type: string }
export interface Route { network: string; prefix: number; nextHop: string; iface: string; type: string }
export interface AddressRow { id: string; location: string; srcMac: string; dstMac: string; srcIp: string; dstIp: string; ttl: number; }
export interface ClientConfig { ip: string; mask: string; gateway: string; dns: string; lease: string; status: string }
export interface SimulationState {
  macTables: Partial<Record<DeviceId, MacEntry[]>>;
  arpCaches: Partial<Record<DeviceId, ArpEntry[]>>;
  routes: Route[];
  statuses: Partial<Record<DeviceId, string>>;
  dnsCache: Record<string, string>;
  connections: Partial<Record<DeviceId, string>>;
  config: ClientConfig;
  addresses: AddressRow[];
  routeMatch?: Route;
  routerView: { received?: Packet; ipPacket?: Packet; outgoing?: Packet; ttlBefore?: number; ttlAfter?: number };
}
export type Change =
  | { kind: 'learn'; device: DeviceId; entry: MacEntry }
  | { kind: 'arp'; device: DeviceId; entry: ArpEntry }
  | { kind: 'status'; device: DeviceId; value: string }
  | { kind: 'connection'; device: DeviceId; value: string }
  | { kind: 'dns'; name: string; ip: string }
  | { kind: 'config'; value: Partial<ClientConfig> }
  | { kind: 'route'; value: Route }
  | { kind: 'router'; value: SimulationState['routerView'] }
  | { kind: 'address'; value: AddressRow };
export interface LabEvent {
  id: string; scenarioId: ScenarioId; index: number; type: string;
  sender: DeviceId; receiver: DeviceId; protocol: Protocol;
  paths: DeviceId[][]; name: string; description: string; teacher: string;
  question: string; answer: string; misconception: string;
  packet: Packet | null; changes: Change[];
  highlightLayers: string[]; highlightFields: string[];
  activeDevices: DeviceId[]; phase: string; duration: number;
  broadcast?: boolean; ingress?: string; egress?: string[];
  failure?: { reason: string; diagnosis: string; fix: string };
}
export interface ScenarioMeta { id: ScenarioId; title: string; subtitle: string; difficulty: string; protocols: Protocol[]; goal: string; }
export interface Scenario { meta: ScenarioMeta; topology: Topology; initial: SimulationState; events: LabEvent[]; fault: FaultId; }
