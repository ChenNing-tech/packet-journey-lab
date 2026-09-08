import { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleHelp, GraduationCap, Info, Pencil, RotateCcw, Save, X } from 'lucide-react';
import type { LabEvent } from '../simulation/types';

const glossary: Record<string, string> = {
  '离散事件': '把通信拆成一串有先后顺序的步骤，每一步只描述一次发送、收帧、查表或状态变化。',
  'IPv4': '本实验使用的网络层协议。源、目的 IP 标识通信两端，路由器用目的 IP 选择下一跳。',
  'IP': '网络层使用的逻辑地址。本实验不涉及 NAT，同一方向跨路由器转发时，源、目的 IP 保持不变。',
  'NAT': '网络地址转换，会按规则改写 IP 地址，有时也改写传输层端口。本实验不模拟 NAT。',
  '默认网关': '当目标不在本地网段时，主机通常把数据交给默认网关。IP 目的地址仍然是最终目标。',
  '子网掩码': '与 IP 地址一起确定网络部分，帮助主机判断目标是否在同一网段。',
  '路由表': '路由器按目的 IP 查找出接口和下一跳；多条路由匹配时，优先选择前缀最长的一条。',
  'MAC 表': '交换机从收到帧的源 MAC 学习对应入端口，再用目的 MAC 查找转发端口。',
  'MAC': '以太网链路上的地址。跨路由器转发时，新的帧头使用这一跳的源、目的 MAC。',
  'ARP': '在同一广播域中，根据一个 IPv4 地址查询对应的 MAC 地址；跨网段时先查询下一跳的 MAC。',
  'TTL': 'IPv4 数据包的生存时间字段。每经过一个转发路由器通常减 1，减为 0 时丢弃，以避免无限循环。',
  'DNS': '把域名解析成 IP 地址。本实验演示 A 记录查询，不模拟完整递归解析过程。',
  'DHCP': '让客户端自动获取 IP、掩码、网关和 DNS 等配置；客户端收到有效 ACK 后才应用租约配置。',
  'ICMP': '用于 IP 网络的控制与差错信息。ping 使用 Echo Request 和 Echo Reply 检查可达性。',
  'TCP': '提供面向连接的可靠字节流传输，通过序号、确认和状态变化管理连接与数据。',
  'SYN': 'TCP 建立连接时用来同步序号的标志；SYN 自身会占用一个序号。',
  'FIN': 'TCP 表示这一方向不再发送数据的标志；FIN 自身会占用一个序号。',
  'ACK': 'TCP 中的确认标志；确认号指向下一个期望收到的序号。DHCP ACK 则是确认租约配置的消息。',
  '广播': '向当前广播域内多个接收者发送。交换机不发回入端口，路由器通常不会跨接口转发二层广播。',
};
const termPattern = new RegExp(`(${Object.keys(glossary).sort((a, b) => b.length - a.length).join('|')})`, 'g');

type TeachingContent = Pick<LabEvent, 'teacher' | 'question' | 'answer' | 'misconception'>;
const storageKey = 'packet-lab.teacher-overrides.v1';
const contentKey = (event: LabEvent) => `${event.scenarioId}:${event.id}`;
const defaultContent = (event: LabEvent): TeachingContent => ({ teacher: event.teacher, question: event.question, answer: event.answer, misconception: event.misconception });
function isTeachingContent(value: unknown): value is TeachingContent {
  if (!value || typeof value !== 'object') return false;
  return ['teacher', 'question', 'answer', 'misconception'].every(key => typeof (value as Record<string, unknown>)[key] === 'string');
}
function readOverride(event: LabEvent): TeachingContent | null {
  try {
    const all = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const saved = all?.[contentKey(event)];
    return isTeachingContent(saved) ? saved : null;
  } catch { return null; }
}
function writeOverride(event: LabEvent, content: TeachingContent | null) {
  const all: Record<string, TeachingContent> = (() => { try { const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } })();
  if (content) all[contentKey(event)] = content; else delete all[contentKey(event)];
  localStorage.setItem(storageKey, JSON.stringify(all));
}

export default function TeachingCard({ event, onClose, onEditStart }: { event: LabEvent; onClose: () => void; onEditStart: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [term, setTerm] = useState<string | null>(null);
  const [override, setOverride] = useState<TeachingContent | null>(() => readOverride(event));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TeachingContent>(() => override ?? defaultContent(event));
  const [saveError, setSaveError] = useState('');
  const bodyId = useId();
  const annotationId = useId();
  const editorId = useId();
  const content = override ?? defaultContent(event);
  const hasAnnotations = Object.keys(glossary).some(word => content.teacher.includes(word));
  const validDraft = Boolean(draft.teacher.trim() && draft.question.trim() && draft.answer.trim());
  const dirty = JSON.stringify(draft) !== JSON.stringify(content);
  useEffect(() => {
    const saved = readOverride(event);
    setOverride(saved); setDraft(saved ?? defaultContent(event)); setEditing(false); setSaveError(''); setAnswerVisible(false); setTerm(null);
  }, [event.id, event.scenarioId]);
  const beginEdit = () => { onEditStart(); setCollapsed(false); setDraft(content); setEditing(true); setSaveError(''); setAnswerVisible(false); setTerm(null); };
  const save = () => {
    if (!validDraft) return;
    const next = { teacher: draft.teacher.trim(), question: draft.question.trim(), answer: draft.answer.trim(), misconception: draft.misconception.trim() };
    const defaults = defaultContent(event);
    const stored = JSON.stringify(next) === JSON.stringify(defaults) ? null : next;
    try { writeOverride(event, stored); setOverride(stored); setDraft(stored ?? defaults); setEditing(false); setSaveError(''); }
    catch { setSaveError('浏览器未能保存修改，请检查是否允许本地存储后重试。'); }
  };
  return <section className={`teacher-panel teacher-float panel ${collapsed ? 'is-collapsed' : ''} ${editing ? 'is-editing' : ''}`} aria-label="课堂讲解">
    <div className="teacher-float-header">
      <GraduationCap size={18}/><h3 title={event.name}>第 {event.index + 1} 步 · {event.name}{override && <span className="customized-badge">已自定义</span>}</h3>
      {!editing && <button className="teacher-edit" aria-label="编辑课堂讲解" onClick={beginEdit}><Pencil size={13}/>编辑</button>}
      {!editing && <button className="teacher-collapse" aria-label={collapsed ? '展开课堂讲解' : '收起课堂讲解'} aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => setCollapsed(value => !value)}>{collapsed ? '展开' : '收起'}{collapsed ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</button>}
      <button className="teacher-close" aria-label="关闭课堂讲解" onClick={onClose}><X size={15}/></button>
    </div>
    <div id={bodyId} className="teacher-body" hidden={collapsed}>
      {editing ? <div id={editorId} className="teaching-editor" role="form" aria-label="编辑课堂讲解内容">
        <p className="editor-note"><Pencil size={13}/>正在编辑当前步骤，播放已暂停。内容仅保存在本机浏览器。</p>
        <label>讲解正文<textarea aria-label="讲解正文" rows={4} maxLength={1200} value={draft.teacher} onChange={e => setDraft(value => ({ ...value, teacher: e.target.value }))}/><small>{draft.teacher.length} / 1200</small></label>
        <label>思考题<textarea aria-label="思考题" rows={2} maxLength={500} value={draft.question} onChange={e => setDraft(value => ({ ...value, question: e.target.value }))}/><small>{draft.question.length} / 500</small></label>
        <label>参考答案<textarea aria-label="参考答案" rows={3} maxLength={800} value={draft.answer} onChange={e => setDraft(value => ({ ...value, answer: e.target.value }))}/><small>{draft.answer.length} / 800</small></label>
        <label>常见误区与补充注释 <span>可留空</span><textarea aria-label="常见误区与补充注释" rows={2} maxLength={800} value={draft.misconception} onChange={e => setDraft(value => ({ ...value, misconception: e.target.value }))}/><small>{draft.misconception.length} / 800</small></label>
        {(!draft.teacher.trim() || !draft.question.trim() || !draft.answer.trim()) && <p className="editor-validation" role="alert">讲解正文、思考题和参考答案不能为空。</p>}
        {saveError && <p className="editor-validation" role="alert">{saveError}</p>}
        <div className="editor-actions"><button onClick={() => { setDraft(defaultContent(event)); setSaveError(''); }} disabled={JSON.stringify(draft) === JSON.stringify(defaultContent(event))}><RotateCcw size={13}/>恢复默认</button><span/><button onClick={() => { setDraft(content); setEditing(false); setSaveError(''); }}>取消</button><button className="save-teaching" onClick={save} disabled={!validDraft || !dirty}><Save size={13}/>保存修改</button></div>
      </div> : <>
      <p className="teacher-explanation">{content.teacher.split(termPattern).map((part, index) => glossary[part] ? <button key={index} className="glossary-term" aria-label={`查看 ${part} 注释`} aria-expanded={term === part} aria-controls={annotationId} onClick={() => setTerm(previous => previous === part ? null : part)}>{part}</button> : part)}</p>
      {hasAnnotations && <div className="annotation-hint"><Info size={12}/>点击带虚线的术语，查看内容注释</div>}
      <div id={annotationId} className="term-annotation" hidden={!term}>{term && <><div><strong>{term} · 注释</strong><button aria-label="关闭术语注释" onClick={() => setTerm(null)}><X size={13}/></button></div><p>{glossary[term]}</p></>}</div>
      <div className="thinking-question"><h4><CircleHelp size={16}/>思考：{content.question}</h4><button onClick={() => setAnswerVisible(value => !value)} aria-expanded={answerVisible}>{answerVisible ? '隐藏答案' : '显示答案'}</button>{answerVisible && <div className="answer" role="status"><Check size={15}/><p>{content.answer}</p></div>}</div>
      {content.misconception && <details className="misconception" key={event.id}><summary>常见误区与补充注释</summary><p>{content.misconception}</p></details>}
      </>}
    </div>
  </section>;
}
