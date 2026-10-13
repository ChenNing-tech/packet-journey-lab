import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewPlayback } from './types';

const STEP_DURATION = 1500;

export function usePreviewPlayback(stepCount: number): PreviewPlayback {
  const [position, setPosition] = useState({ step: 0, progress: 0 });
  const positionRef = useRef(position);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const previousTime = useRef<number | null>(null);
  const count = Math.max(1, stepCount);

  const updatePosition = useCallback((next: { step: number; progress: number }) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  useEffect(() => {
    updatePosition({ step: 0, progress: 0 });
    setPlaying(false);
    previousTime.current = null;
  }, [count, updatePosition]);

  useEffect(() => {
    if (!playing) {
      previousTime.current = null;
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      const last = previousTime.current ?? now;
      previousTime.current = now;
      const current = positionRef.current;
      const delta = Math.min(80, now - last) * speed / STEP_DURATION;
      const total = Math.min(count, current.step + current.progress + delta);
      if (total >= count) {
        updatePosition({ step: count - 1, progress: 1 });
        setPlaying(false);
        return;
      }
      updatePosition({ step: Math.floor(total), progress: total % 1 });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, count, updatePosition]);

  const seek = useCallback((nextStep: number) => {
    setPlaying(false);
    previousTime.current = null;
    updatePosition({ step: Math.max(0, Math.min(count - 1, nextStep)), progress: 0 });
  }, [count, updatePosition]);
  const play = useCallback(() => {
    if (positionRef.current.step === count - 1 && positionRef.current.progress >= 1) {
      updatePosition({ step: 0, progress: 0 });
    }
    setPlaying(true);
  }, [count, updatePosition]);
  const pause = useCallback(() => setPlaying(false), []);

  return {
    ...position, playing, speed, play, pause,
    previous: () => seek(positionRef.current.step - 1),
    next: () => seek(positionRef.current.step + 1),
    reset: () => seek(0),
    seek,
    setSpeed: setSpeedState,
  };
}
