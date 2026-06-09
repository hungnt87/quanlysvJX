import { describe, expect, it } from 'vitest';
import { normalizeTail } from './logStream.js';

describe('normalizeTail', () => {
  it('defaults to 300', () => {
    expect(normalizeTail(undefined)).toBe(300);
  });

  it('clamps low values to 50', () => {
    expect(normalizeTail('1')).toBe(50);
  });

  it('clamps high values to 2000', () => {
    expect(normalizeTail('9999')).toBe(2000);
  });

  it('accepts safe numeric values', () => {
    expect(normalizeTail('500')).toBe(500);
  });
});
