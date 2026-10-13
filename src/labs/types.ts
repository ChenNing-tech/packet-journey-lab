export type LabRoute = 'packet' | 'signal-encoding' | 'data-switching';

export interface PreviewPlayback {
  step: number;
  progress: number;
  playing: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  reset: () => void;
  seek: (step: number) => void;
  setSpeed: (speed: number) => void;
}
