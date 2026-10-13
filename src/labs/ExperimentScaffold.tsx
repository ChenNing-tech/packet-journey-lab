import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, Maximize, Minimize, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { PreviewPlayback } from './types';

interface ExperimentScaffoldProps {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  contextLabel?: string;
  steps: string[];
  playback: PreviewPlayback;
  left: ReactNode;
  canvas: ReactNode;
  right: ReactNode;
  modeBar?: ReactNode;
  speeds?: number[];
  footnote?: string;
  onOperation?: (type: string, detail: string) => void;
}

export default function ExperimentScaffold({ eyebrow, title, description, badge, contextLabel = badge, steps, playback, left, canvas, right, modeBar, speeds = [0.5, 1, 1.5, 2], onOperation, footnote = '本阶段展示页面结构与教学交互，完整仿真将在后续阶段接入。' }: ExperimentScaffoldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  const toggleFullscreen = async () => {
    try {
      setFullscreenError('');
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
      onOperation?.('切换全屏', fullscreen ? '退出全屏' : '进入全屏');
    } catch {
      setFullscreenError('当前浏览器无法进入全屏，可使用浏览器自带的全屏功能。');
    }
  };
  const currentStep = steps[playback.step];
  const completion = ((playback.step + playback.progress) / Math.max(1, steps.length)) * 100;

  const operate = (action: 'play' | 'pause' | 'previous' | 'next' | 'reset') => {
    onOperation?.({ play: '播放', pause: '暂停', previous: '上一步', next: '下一步', reset: '重置播放' }[action], currentStep ?? '');
    playback[action]();
  };

  return <div ref={rootRef} className="concept-lab-shell" tabIndex={0} aria-label={title + '工作区'} onKeyDown={event => {
    if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [role="button"], [role="tab"]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ') { event.preventDefault(); operate(playback.playing ? 'pause' : 'play'); }
    if (event.key === 'ArrowRight') { event.preventDefault(); operate('next'); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); operate('previous'); }
  }}>
    <header className="concept-topbar panel" aria-label="实验室工具栏">
      <div className="concept-lab-header">
        <div className="concept-title"><h1>{title}</h1><span className="concept-eyebrow">{eyebrow}</span></div>
        <span className="concept-context-label" title={badge}>{contextLabel}</span>
        <span className="concept-step-counter">步骤 <strong>{playback.step + 1} / {steps.length}</strong></span>
      </div>
      <section className="concept-playback" aria-label="实验播放控制">
      <div className="concept-controls">
        <button className={`play-button ${playback.playing ? 'is-playing' : ''}`} onClick={() => operate(playback.playing ? 'pause' : 'play')}>
          {playback.playing ? <Pause size={15} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}{playback.playing ? '暂停' : '播放'}
        </button>
        <button className="control-button" aria-label="上一步" onClick={() => operate('previous')} disabled={playback.step === 0}><SkipBack size={14}/>上一步</button>
        <button className="control-button" aria-label="下一步" onClick={() => operate('next')} disabled={playback.step === steps.length - 1}>下一步<SkipForward size={14}/></button>
        <button className="control-button" aria-label="重置实验" onClick={() => operate('reset')}><RotateCcw size={14}/>重置</button>
      </div>
      <div className="concept-speed" role="group" aria-label="播放速度">
        {speeds.map(speed => <button key={speed} aria-pressed={playback.speed === speed} onClick={() => { onOperation?.('修改播放倍率', speed + '×'); playback.setSpeed(speed); }}>{speed}×</button>)}
      </div>
      <button className="control-button concept-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '全屏'}>{fullscreen ? <Minimize size={14}/> : <Maximize size={14}/>}<span>{fullscreen ? '退出全屏' : '全屏'}</span></button>
      <button className="concept-help-button" aria-label="实验使用指南" aria-expanded={helpOpen} aria-controls="concept-lab-help" onClick={() => setHelpOpen(open => !open)} title="实验使用指南"><CircleHelp size={16}/></button>
      </section>
      <div className="concept-progress">
        <div><strong>步骤 {String(playback.step + 1).padStart(2, '0')}</strong><span>{currentStep}</span></div>
        <input aria-label="实验时间进度" type="range" min="0" max={steps.length - 1} value={playback.step} onChange={event => {
          const index = Number(event.target.value);
          onOperation?.('进度跳转', '步骤 ' + (index + 1) + '：' + steps[index]);
          playback.seek(index);
        }} style={{ '--concept-progress': `${completion}%` } as React.CSSProperties}/>
        <span>{steps.length}</span>
      </div>
      {helpOpen && <div className="concept-toolbar-help" id="concept-lab-help"><CircleHelp size={15}/><div><strong>{description}</strong><p>{footnote}</p><p>当前使用模式：{badge}。进度条可定位任意步骤；单步与跳转会暂停播放。</p></div></div>}
      {fullscreenError && <p className="concept-toolbar-error" role="status">{fullscreenError}</p>}
    </header>

    {modeBar && <section className="concept-modebar panel" aria-label="实验模式切换">{modeBar}</section>}

    <main className="concept-workspace">
      <aside className="concept-rail panel" aria-label="参数设置与实验模式">{left}</aside>
      <section className="concept-canvas panel" aria-label={`${title}可视化实验画布`}>{canvas}</section>
      <aside className="concept-inspector panel" aria-label="知识解释与当前状态">{right}</aside>
    </main>
  </div>;
}
