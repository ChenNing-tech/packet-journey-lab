import { Check, ClipboardCheck, Download, Lightbulb, Play, RotateCcw, Target } from 'lucide-react';
import type { LearningMode, TeachingTaskDefinition, TeachingTaskId } from './teachingTasks';

export function LearningModeSwitch({ mode, onChange, demoDescription = '关键步骤自动暂停' }: { mode: LearningMode; onChange: (mode: LearningMode) => void; demoDescription?: string }) {
  return <div className="learning-mode-switch" role="tablist" aria-label="实验使用模式">
    <button role="tab" aria-selected={mode === 'demo'} onClick={() => onChange('demo')}><Play size={13}/><span><strong>演示模式</strong><small>{demoDescription}</small></span></button>
    <button role="tab" aria-selected={mode === 'explore'} onClick={() => onChange('explore')}><Target size={13}/><span><strong>自由探索</strong><small>自主调整全部参数</small></span></button>
  </div>;
}

interface TeachingTaskPanelProps<T extends TeachingTaskId> {
  tasks: TeachingTaskDefinition<T>[];
  activeTaskId: T;
  completedTaskIds: T[];
  learningMode: LearningMode;
  feedback: string;
  onSelect: (id: T) => void;
  onStart: () => void;
  onReset: () => void;
  onExport: () => void;
}

export default function TeachingTaskPanel<T extends TeachingTaskId>({ tasks, activeTaskId, completedTaskIds, learningMode, feedback, onSelect, onStart, onReset, onExport }: TeachingTaskPanelProps<T>) {
  const task = tasks.find(item => item.id === activeTaskId) ?? tasks[0];
  const completed = completedTaskIds.includes(task.id);
  return <section className="teaching-task-panel" aria-label="教学任务">
    <header><span><ClipboardCheck size={15}/><strong>教学任务</strong></span><b>{completedTaskIds.length}/{tasks.length}</b></header>
    <div className="task-selector" role="tablist" aria-label="任务列表">{tasks.map((item, index) => <button key={item.id} role="tab" aria-selected={item.id === task.id} className={completedTaskIds.includes(item.id) ? 'completed' : ''} onClick={() => onSelect(item.id)} aria-label={'任务 ' + (index + 1) + '：' + item.title.replace(/^任务 \d+ · /, '')}><span>{completedTaskIds.includes(item.id) ? <Check size={11}/> : index + 1}</span></button>)}</div>
    <div className="task-detail">
      <h3>{task.title}</h3>
      <dl><div><dt>实验目标</dt><dd>{task.goal}</dd></div><div><dt>操作步骤</dt><dd>{task.steps.join(' → ')}</dd></div><div><dt>观察提示</dt><dd><Lightbulb size={11}/>{task.hint}</dd></div><div><dt>完成条件</dt><dd>{task.completion}</dd></div></dl>
      <p className={completed ? 'task-feedback completed' : 'task-feedback'} role="status"><strong>{completed ? '任务完成' : '进行中'}</strong>{completed ? '完成条件已由真实实验状态验证。' : feedback}</p>
    </div>
    <div className="task-actions"><button className="task-start" onClick={onStart}><Play size={12}/>{learningMode === 'demo' ? '开始引导演示' : '加载任务参数'}</button><button onClick={onReset} aria-label="重新实验" title="重新实验：清空记录并恢复默认参数"><RotateCcw size={12}/></button><button onClick={onExport} aria-label="导出实验记录" title="导出本地 JSON 实验记录"><Download size={12}/></button></div>
  </section>;
}
