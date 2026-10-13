export type SignalEncodingMode = 'nrz' | 'manchester';
export type SignalLevel = 'high' | 'low';
export type TransitionDirection = 'low-to-high' | 'high-to-low';

export interface EncodedBit {
  index: number;
  bit: '0' | '1';
  firstLevel: SignalLevel;
  secondLevel: SignalLevel;
  boundaryTransition: boolean;
  middleTransition: TransitionDirection | null;
}

export interface EncodedSignal {
  mode: SignalEncodingMode;
  bits: string;
  units: EncodedBit[];
}

export function sanitizeBinaryInput(value: string, maxLength = 32) {
  return value.replace(/[^01]/g, '').slice(0, maxLength);
}

export function encodeSignal(bits: string, mode: SignalEncodingMode): EncodedSignal {
  const cleanBits = sanitizeBinaryInput(bits);
  let previousEnd: SignalLevel | null = null;
  const units = cleanBits.split('').map((value, index): EncodedBit => {
    const bit = value as '0' | '1';
    const firstLevel: SignalLevel = mode === 'nrz'
      ? bit === '1' ? 'high' : 'low'
      : bit === '1' ? 'low' : 'high';
    const secondLevel: SignalLevel = mode === 'nrz'
      ? firstLevel
      : bit === '1' ? 'high' : 'low';
    const unit: EncodedBit = {
      index,
      bit,
      firstLevel,
      secondLevel,
      boundaryTransition: previousEnd !== null && previousEnd !== firstLevel,
      middleTransition: mode === 'manchester'
        ? bit === '1' ? 'low-to-high' : 'high-to-low'
        : null,
    };
    previousEnd = secondLevel;
    return unit;
  });
  return { mode, bits: cleanBits, units };
}

export function levelAt(signal: EncodedSignal, bitIndex: number, bitProgress: number): SignalLevel | null {
  const unit = signal.units[bitIndex];
  if (!unit) return null;
  return bitProgress < 0.5 ? unit.firstLevel : unit.secondLevel;
}

export function explainBit(signal: EncodedSignal, bitIndex: number, bitProgress: number) {
  const unit = signal.units[bitIndex];
  if (!unit) return { state: '等待输入', explanation: '请输入 1—32 位二进制数据。' };
  if (signal.mode === 'nrz') {
    const level = unit.firstLevel === 'high' ? '高电平' : '低电平';
    const boundary = bitIndex === 0
      ? '这是序列的第一个比特。'
      : unit.boundaryTransition
        ? '它与前一比特不同，因此在位边界发生电平切换。'
        : '它与前一比特相同，因此位边界保持原电平。';
    return { state: level, explanation: `NRZ-L 用${level}表示 ${unit.bit}，整个比特时间内电平保持不变。${boundary}` };
  }
  const firstHalf = bitProgress < 0.5;
  const level = (firstHalf ? unit.firstLevel : unit.secondLevel) === 'high' ? '高电平' : '低电平';
  const direction = unit.middleTransition === 'low-to-high' ? '低到高' : '高到低';
  const phase = firstHalf ? '前半位' : '后半位';
  const boundary = bitIndex > 0 && unit.boundaryTransition
    ? '相邻比特在位边界还有一次额外跳变。'
    : '位边界不需要额外跳变。';
  return { state: `${level}（${phase}）`, explanation: `该比特为 ${unit.bit}，中点必须${direction}跳变。当前指针位于${phase}，所以信号为${level}。${boundary}` };
}

export function generateChallenge(previous = '', random: () => number = Math.random) {
  const length = 5 + Math.floor(random() * 4);
  let bits = '';
  for (let index = 0; index < length; index += 1) bits += random() >= 0.5 ? '1' : '0';
  if (bits === previous) bits = `${bits.slice(0, -1)}${bits.endsWith('1') ? '0' : '1'}`;
  return bits;
}
