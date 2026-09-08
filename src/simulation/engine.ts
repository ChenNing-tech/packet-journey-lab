import type { Change, LabEvent, Route, Scenario, SimulationState } from './types';

export const clone = <T,>(value: T): T => structuredClone(value);

export function applyChanges(state: SimulationState, changes: Change[]): SimulationState {
  const next = clone(state);
  for (const change of changes) {
    switch (change.kind) {
      case 'learn': {
        const rows = next.macTables[change.device] ?? [];
        next.macTables[change.device] = [...rows.filter(r => !(r.mac === change.entry.mac && r.vlan === change.entry.vlan)), clone(change.entry)];
        break;
      }
      case 'arp': next.arpCaches[change.device] = [...(next.arpCaches[change.device] ?? []).filter(r => r.ip !== change.entry.ip || r.iface !== change.entry.iface), clone(change.entry)]; break;
      case 'status': next.statuses[change.device] = change.value; break;
      case 'connection': next.connections[change.device] = change.value; break;
      case 'dns': next.dnsCache[change.name] = change.ip; break;
      case 'config': Object.assign(next.config, change.value); break;
      case 'route': next.routeMatch = clone(change.value); break;
      case 'router': Object.assign(next.routerView, clone(change.value)); break;
      case 'address': next.addresses.push(clone(change.value)); break;
    }
  }
  return next;
}

/** Snapshot N means all atomic state changes through event N have committed. */
export function stateAt(scenario: Scenario, index: number): SimulationState {
  return scenario.events.slice(0, Math.max(0, Math.min(index + 1, scenario.events.length)))
    .reduce((state, event) => applyChanges(state, event.changes), clone(scenario.initial));
}

export function compileSnapshots(scenario: Scenario): SimulationState[] {
  let state = clone(scenario.initial);
  return scenario.events.map(event => { state = applyChanges(state, event.changes); return state; });
}

export function ipv4Number(ip: string): number {
  return ip.split('.').reduce((result, byte) => ((result << 8) | Number(byte)) >>> 0, 0);
}
export function sameSubnet(a: string, b: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(a) & mask) === (ipv4Number(b) & mask);
}
export function longestPrefixMatch(ip: string, routes: Route[]): Route | undefined {
  return [...routes].filter(r => sameSubnet(ip, r.network, r.prefix)).sort((a, b) => b.prefix - a.prefix)[0];
}

export interface Playback { index: number; progress: number; playing: boolean; speed: number; replay: number; replayOnly?: boolean }
export type PlaybackAction = { type: 'PLAY' | 'PAUSE' | 'RESET' | 'NEXT' | 'PREVIOUS' | 'REPLAY' } | { type: 'SEEK'; index: number } | { type: 'SPEED'; speed: number } | { type: 'TICK'; delta: number };
export const initialPlayback: Playback = { index: 0, progress: 0, playing: false, speed: 1, replay: 0 };

export function advancePlayback(state: Playback, action: PlaybackAction, events: LabEvent[]): Playback {
  const last = events.length - 1;
  switch (action.type) {
    case 'PLAY': return events[state.index]?.failure ? { ...state, playing: false } : state.index === last && state.progress === 1 ? { ...state, index: 0, progress: 0, playing: true, replayOnly: false } : { ...state, playing: true, replayOnly: false };
    case 'PAUSE': return { ...state, playing: false };
    case 'RESET': return { ...initialPlayback, speed: state.speed, replay: state.replay + 1 };
    case 'SPEED': return { ...state, speed: action.speed };
    case 'NEXT': return { ...state, index: Math.min(last, state.index + 1), progress: 1, playing: false, replayOnly: false };
    case 'PREVIOUS': return { ...state, index: Math.max(0, state.index - 1), progress: 1, playing: false, replayOnly: false };
    case 'SEEK': return { ...state, index: Math.max(0, Math.min(last, action.index)), progress: 1, playing: false, replayOnly: false };
    case 'REPLAY': return { ...state, progress: 0, playing: !events[state.index]?.failure, replay: state.replay + 1, replayOnly: true };
    case 'TICK': {
      if (!state.playing) return state;
      if (events[state.index].failure) return { ...state, progress: 1, playing: false };
      const progress = state.progress + action.delta * state.speed / events[state.index].duration;
      if (progress < 1) return { ...state, progress };
      if (state.replayOnly) return { ...state, progress: 1, playing: false, replayOnly: false };
      if (state.index === last) return { ...state, progress: 1, playing: false };
      const index = state.index + 1;
      return { ...state, index, progress: events[index].failure ? 1 : 0, playing: !events[index].failure };
    }
  }
}
