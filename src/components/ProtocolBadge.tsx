import type { CSSProperties } from 'react';
import type { Protocol } from '../simulation/types';

export const protocolColors: Record<Protocol, string> = { SYSTEM: '#64748B', ARP: '#F59E0B', ICMP: '#8B5CF6', TCP: '#0EA5E9', UDP: '#14B8A6', DNS: '#EC4899', DHCP: '#F97316', HTTP: '#22A06B' };
export function ProtocolBadge({ protocol, label }: { protocol: Protocol; label?: string }) {
  return <span className={`protocol-badge protocol-${protocol.toLowerCase()}`} style={{ '--protocol': protocolColors[protocol] } as CSSProperties}>{label ?? (protocol === 'SYSTEM' ? '准备' : protocol)}</span>;
}
