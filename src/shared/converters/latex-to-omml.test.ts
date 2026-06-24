import { describe, it, expect } from 'vitest';
import { unwrapBoxed } from '@/shared/converters/latex-to-omml';

describe('unwrapBoxed', () => {
  it('剥离整体 boxed', () => {
    expect(unwrapBoxed('\\boxed{x=1}')).toEqual({ inner: 'x=1', boxed: true });
  });
  it('容忍空格与嵌套花括号', () => {
    expect(unwrapBoxed('  \\boxed{ \\frac{a}{b} }  ')).toEqual({ inner: ' \\frac{a}{b} ', boxed: true });
  });
  it('非整体 boxed 不剥离', () => {
    expect(unwrapBoxed('\\boxed{a}+\\boxed{b}')).toEqual({ inner: '\\boxed{a}+\\boxed{b}', boxed: false });
  });
  it('无 boxed 原样返回', () => {
    expect(unwrapBoxed('x=1')).toEqual({ inner: 'x=1', boxed: false });
  });
});
