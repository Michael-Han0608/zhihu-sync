// src/shared/converters/latex-to-omml.ts
// LaTeX → 可注入文档的 OMML 组件
// 依赖: temml, mathml2omml(vendored), docx

/**
 * 若 LaTeX 整体被 \boxed{} 包裹,剥离并标记;否则原样返回。
 * "整体"指第一个 { 的配对 } 恰好是字符串末尾。
 */
export function unwrapBoxed(latex: string): { inner: string; boxed: boolean } {
  const trimmed = latex.trim();
  const prefix = '\\boxed{';
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith('}')) {
    return { inner: latex, boxed: false };
  }
  let depth = 0;
  const start = prefix.length - 1; // 指向第一个 '{'
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // 配对的 '}' 必须是末尾字符才算整体 boxed
        if (i === trimmed.length - 1) {
          return { inner: trimmed.slice(start + 1, i), boxed: true };
        }
        return { inner: latex, boxed: false };
      }
    }
  }
  return { inner: latex, boxed: false };
}
