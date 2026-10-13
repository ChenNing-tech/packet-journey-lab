import { Binary, Network, Route } from 'lucide-react';
import type { LabRoute } from './types';

const LABS: Array<{ id: LabRoute; label: string; shortLabel: string; icon: typeof Network }> = [
  { id: 'packet', label: '数据包传输动画实验室', shortLabel: '数据包传输', icon: Network },
  { id: 'signal-encoding', label: '数字信号编码实验室', shortLabel: '信号编码', icon: Binary },
  { id: 'data-switching', label: '数据交换技术实验室', shortLabel: '数据交换', icon: Route },
];

export default function LabNavigation({ active, onChange }: { active: LabRoute; onChange: (route: LabRoute) => void }) {
  return <nav className="lab-suite-nav" aria-label="虚拟实验室导航">
    <div className="suite-brand"><span aria-hidden="true"><Network size={17}/></span><strong>计算机网络虚拟实验室</strong></div>
    <div className="suite-tabs" role="tablist" aria-label="实验室模块">
      {LABS.map(lab => {
        const Icon = lab.icon;
        return <button key={lab.id} role="tab" aria-selected={active === lab.id} onClick={() => onChange(lab.id)}>
          <Icon size={15}/><span className="suite-label-full">{lab.label}</span><span className="suite-label-short">{lab.shortLabel}</span>
        </button>;
      })}
    </div>
  </nav>;
}
