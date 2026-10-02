import { describe, expect, it } from 'vitest';
import { add, average } from './math.js';

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});

describe('average', () => {
  it('computes the average of a list', () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it('throws on an empty list', () => {
    expect(() => average([])).toThrow(RangeError);
  });
});
