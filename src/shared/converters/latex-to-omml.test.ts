import { describe, it, expect } from 'vitest';
import { unwrapBoxed, fixAccents, wrapWithBorderBox } from '@/shared/converters/latex-to-omml';

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

describe('fixAccents', () => {
  const dotOmml =
    '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
    '<m:limUpp><m:e><m:r><m:t>c</m:t></m:r></m:e>' +
    '<m:lim><m:r><m:t>˙</m:t></m:r></m:lim></m:limUpp></m:oMath>';

  it('把重音 limUpp 改写成 acc', () => {
    const out = fixAccents(dotOmml);
    expect(out).toContain('<m:acc');
    expect(out).toMatch(/<m:chr m:val="˙"\s*\/?>/);
    expect(out).not.toContain('<m:limUpp');
    expect(out).toContain('<m:t>c</m:t>'); // 基底保留
  });

  it('非重音 limUpp(真实上极限)不动', () => {
    const lim =
      '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
      '<m:limUpp><m:e><m:r><m:t>x</m:t></m:r></m:e>' +
      '<m:lim><m:r><m:t>n</m:t></m:r></m:lim></m:limUpp></m:oMath>';
    expect(fixAccents(lim)).toContain('<m:limUpp');
  });
});

describe('wrapWithBorderBox', () => {
  it('用 borderBox 包裹 oMath 内容', () => {
    const omml =
      '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
      '<m:r><m:t>x=1</m:t></m:r></m:oMath>';
    const out = wrapWithBorderBox(omml);
    expect(out).toContain('<m:borderBox');
    expect(out).toContain('<m:e>');
    expect(out).toContain('<m:t>x=1</m:t>');
  });
});
