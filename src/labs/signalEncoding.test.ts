import { describe, expect, it } from 'vitest';
import { encodeSignal, explainBit, generateChallenge, levelAt, sanitizeBinaryInput } from './signalEncoding';

const PRESETS = ['10110', '111111', '010101', '000000'];

describe('数字信号编码模型', () => {
  it('只保留前 32 个二进制字符', () => {
    expect(sanitizeBinaryInput('10a1-02')).toBe('1010');
    expect(sanitizeBinaryInput('1'.repeat(40))).toHaveLength(32);
  });

  it.each(PRESETS)('NRZ-L 按位生成稳定高低电平：%s', bits => {
    const signal = encodeSignal(bits, 'nrz');
    expect(signal.units.map(unit => unit.firstLevel)).toEqual(bits.split('').map(bit => bit === '1' ? 'high' : 'low'));
    expect(signal.units.every(unit => unit.firstLevel === unit.secondLevel && unit.middleTransition === null)).toBe(true);
    expect(signal.units.slice(1).map(unit => unit.boundaryTransition)).toEqual(bits.slice(1).split('').map((bit, index) => bit !== bits[index]));
  });

  it.each(PRESETS)('曼彻斯特每一位都按约定产生中点跳变：%s', bits => {
    const signal = encodeSignal(bits, 'manchester');
    expect(signal.units.map(unit => [unit.firstLevel, unit.secondLevel])).toEqual(bits.split('').map(bit => bit === '1' ? ['low', 'high'] : ['high', 'low']));
    expect(signal.units.map(unit => unit.middleTransition)).toEqual(bits.split('').map(bit => bit === '1' ? 'low-to-high' : 'high-to-low'));
  });

  it('曼彻斯特相同比特在边界额外跳变，不同比特边界保持', () => {
    expect(encodeSignal('1100', 'manchester').units.map(unit => unit.boundaryTransition)).toEqual([false, true, false, true]);
  });

  it('当前电平与解释由编码结果和位内进度驱动', () => {
    const signal = encodeSignal('10', 'manchester');
    expect(levelAt(signal, 0, 0.25)).toBe('low');
    expect(levelAt(signal, 0, 0.75)).toBe('high');
    expect(explainBit(signal, 0, 0.25).explanation).toContain('低到高');
    expect(explainBit(signal, 1, 0.75).state).toContain('低电平');
  });

  it('重新出题会生成 5—8 位且不复用当前题目', () => {
    const values = [0, 0.9, 0.1, 0.9, 0.1, 0.9];
    let cursor = 0;
    const bits = generateChallenge('10101', () => values[cursor++] ?? 0.9);
    expect(bits).toMatch(/^[01]{5,8}$/);
    expect(bits).not.toBe('10101');
  });
});
