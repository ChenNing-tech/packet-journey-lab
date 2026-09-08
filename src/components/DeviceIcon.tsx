import { useId } from 'react';
import type { Device, ScenarioId } from '../simulation/types';

/** Shared, locally drawn vector equipment. No image downloads or raster scaling. */
export function DeviceGlyph({ type, service }: { type: Device['type']; service?: 'DNS' | 'DHCP' }) {
  const uid = useId().replace(/:/g, '');
  const paint = (name: string) => `url(#${uid}-${name})`;
  return <g className={`equipment equipment-${type}`}>
    <defs>
      <linearGradient id={`${uid}-screen`} x2="1" y2="1"><stop stopColor="#BDE5FF"/><stop offset=".5" stopColor="#76B8F0"/><stop offset="1" stopColor="#3D7EC6"/></linearGradient>
      <linearGradient id={`${uid}-metal`} x2="0" y2="1"><stop stopColor="#F2F6FA"/><stop offset="1" stopColor="#AEBCCD"/></linearGradient>
      <linearGradient id={`${uid}-front`} x2="1" y2="1"><stop stopColor="#65758A"/><stop offset="1" stopColor="#303C4F"/></linearGradient>
      <linearGradient id={`${uid}-top`} x2="1" y2="1"><stop stopColor="#91A2B6"/><stop offset="1" stopColor="#586B82"/></linearGradient>
      <linearGradient id={`${uid}-router`} x2="1" y2=".35"><stop stopColor="#1B3F6C"/><stop offset=".42" stopColor="#315F96"/><stop offset="1" stopColor="#102D50"/></linearGradient>
      <linearGradient id={`${uid}-routerTop`} x2="1" y2=".8"><stop stopColor="#53A6F2"/><stop offset=".55" stopColor="#347FCF"/><stop offset="1" stopColor="#215BA8"/></linearGradient>
    </defs>
    {type === 'pc' && <g strokeLinejoin="round">
      <path d="M-7 22h14v14H-7z" fill="#52677F" stroke="#344961" strokeWidth="1.5"/>
      <path d="M-18 35H18l6 5v3h-48v-3z" fill={paint('metal')} stroke="#94A5B9"/>
      <rect x="-33" y="-37" width="66" height="58" rx="4" fill="#243547" stroke="#152538" strokeWidth="1.5"/>
      <rect x="-29" y="-33" width="58" height="43" rx="1" fill={paint('screen')}/>
      <path d="M-27-31h31L-27 4z" fill="#E3F5FF" opacity=".24"/>
      <path d="M-33 12H33v7a3 3 0 0 1-3 3H-30a3 3 0 0 1-3-3z" fill={paint('metal')} stroke="#8C9FB5"/>
      <circle cy="17" r="1.5" fill="#72859C"/>
      <path d="M-43 45H31l5 6h-83z" fill="#E0E7EF" stroke="#A8B8CB" strokeWidth=".7"/>
      <path d="M-35 47h56M-30 49H25" stroke="#B5C1CF" strokeWidth=".8"/>
      <ellipse cx="45" cy="47" rx="5" ry="3.5" fill="#D5DFEB" stroke="#A4B5C9" strokeWidth=".7"/>
    </g>}
    {type === 'switch' && <g strokeLinejoin="round">
      <path d="M-46-6-27-27H46L29-6z" fill={paint('top')} stroke="#35465D" strokeWidth="1.5"/>
      <path d="M29-6 46-27V8L29 27z" fill="#38485D" stroke="#25394F" strokeWidth="1.5"/>
      <rect x="-46" y="-6" width="75" height="33" rx="3" fill={paint('front')} stroke="#293D54" strokeWidth="1.5"/>
      <path d="M-42-3H24" stroke="#A0B0C4" strokeOpacity=".55"/>
      <rect x="-39" y="3" width="61" height="16" rx="2" fill="#C9D4DF" stroke="#26394D"/>
      {[-35,-23,-11,1,13].map(x => <g key={x}><path d={`M${x} 6h8v9h-8z`} fill="#172D39"/><path d={`M${x + 2} 6v-2h4v2`} fill="#172D39"/><path d={`M${x + 1} 14h6`} stroke="#78AD95"/></g>)}
      <circle cx="-35" cy="23" r="1.5" fill="#9EE2AC"/><circle cx="-29" cy="23" r="1.5" fill="#9EE2AC"/>
      <path d="M35 0v9m4-14v9" stroke="#1F3146" strokeWidth="1.3"/>
    </g>}
    {type === 'router' && <g strokeLinejoin="round">
      <path d="M-47-9V12a47 24 0 0 0 94 0V-9z" fill={paint('router')} stroke="#102F54" strokeWidth="1.5"/>
      <path d="M-46 13a46 23 0 0 0 92 0" fill="none" stroke="#0B294A" strokeWidth="1.2"/>
      <ellipse cy="-9" rx="47" ry="23" fill={paint('routerTop')} stroke="#285E99" strokeWidth="1.4"/>
      <ellipse cy="-9" rx="45.4" ry="21.5" fill="none" stroke="#79B8F8" strokeOpacity=".75" strokeWidth=".8"/>
      <g className="router-direction-arrows" fill="#FBFDFF" stroke="#286BB1" strokeWidth=".4" transform="translate(0,-9)">
        <path d="M-5-4-18-11-14-13-29-15-26-6-22-9-10-2Q-8-1-5-4Z"/>
        <path d="M5-4 18-11 14-13 29-15 26-6 22-9 10-2Q8-1 5-4Z"/>
        <path d="M-5 4-18 11-14 13-29 15-26 6-22 9-10 2Q-8 1-5 4Z"/>
        <path d="M5 4 18 11 14 13 29 15 26 6 22 9 10 2Q8 1 5 4Z"/>
      </g>
      <path d="M-29 21  -16 24" stroke="#081F38" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M-29 21-16 24" stroke="#4374A8" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="29" cy="19" r="2.5" fill="#5DE44B" stroke="#286E33" strokeWidth=".9"/><circle cx="28.4" cy="18.3" r=".8" fill="#D2FFAB"/>
    </g>}
    {type === 'server' && <g strokeLinejoin="round">
      <path d="M-29-31-13-47H34L18-31z" fill={paint('top')} stroke="#30445D" strokeWidth="1.4"/>
      <path d="M18-31 34-47V24L18 41z" fill="#35465D" stroke="#253B54" strokeWidth="1.4"/>
      <rect x="-29" y="-31" width="47" height="72" rx="3" fill={paint('front')} stroke="#2D4057" strokeWidth="1.5"/>
      <rect x="-23" y="-23" width="35" height="10" rx="1.2" fill="#263B52" stroke="#8092A8" strokeWidth=".8"/>
      <path d="M-20-18H2" stroke="#54ADF1" strokeWidth="2"/>
      {[-5,7,19].map(y => <g key={y}><rect x="-23" y={y} width="35" height="8" rx="1" fill="#33485F" stroke="#253A50" strokeWidth=".6"/><path d={`M-19 ${y + 4}h20`} stroke="#748AA1" strokeWidth=".7"/><circle cx="8" cy={y + 4} r="1.8" fill="#90D9A3"/></g>)}
      <circle cx="7" cy="34" r="2.3" fill="#8DA9C5"/>
      <g transform="translate(31,27)"><circle r="12" fill="#EDF7FF" stroke="#2474CF" strokeWidth="1.5"/><ellipse rx="5" ry="12" fill="none" stroke="#2474CF" strokeWidth="1.2"/><path d="M-12 0H12M-10-6H10M-10 6H10" fill="none" stroke="#2474CF" strokeWidth="1.1"/></g>
      {service && <g><rect x="-32" y="-23" width="52" height="22" rx="4" fill={service === 'DNS' ? '#2373D7' : '#E08B25'} stroke="white" strokeWidth="1.3"/><text x="-6" y="-8" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">{service}</text></g>}
    </g>}
  </g>;
}

export function DeviceIcon({ type, service }: { type: Device['type']; service?: 'DNS' | 'DHCP' }) {
  return <svg viewBox="-57 -57 114 114" className="equipment-icon" aria-hidden="true"><DeviceGlyph type={type} service={service}/></svg>;
}

export function ScenarioIcon({ id }: { id: ScenarioId }) {
  if (id === 'lan-ping') return <DeviceIcon type="pc"/>;
  if (id === 'routed-ping') return <DeviceIcon type="router"/>;
  if (id === 'web') return <DeviceIcon type="server"/>;
  if (id === 'dns' || id === 'dhcp') return <DeviceIcon type="server" service={id === 'dns' ? 'DNS' : 'DHCP'}/>;
  const label = id === 'arp' ? 'ARP' : id === 'tcp-open' ? 'SYN' : 'FIN';
  const color = id === 'arp' ? '#E5A02B' : '#378BCB';
  return <svg viewBox="0 0 64 64" className="equipment-icon" aria-hidden="true"><path d="M15 49h34M32 39v10M15 49v6m34-6v6" fill="none" stroke="#7A91A8" strokeWidth="2"/><rect x="9" y="10" width="46" height="31" rx="6" fill={color} stroke="#627891" strokeWidth="1.3"/><path d="M12 14h40" stroke="white" strokeOpacity=".55"/><rect x="13" y="42" width="38" height="3" rx="1" fill="#CAD8E5"/><text x="32" y="31" textAnchor="middle" fill="white" fontWeight="750" fontSize="18">{label}</text>{[15,32,49].map(x => <circle key={x} cx={x} cy="55" r="3" fill="#59B7A8" stroke="#377D75" strokeWidth=".8"/>)}</svg>;
}
