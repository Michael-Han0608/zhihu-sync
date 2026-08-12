// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { encodeNativeMessage, NativeMessageDecoder } from './protocol';

describe('Native Messaging protocol', () => {
  it('支持分块输入', () => {
    const decoder = new NativeMessageDecoder();
    const encoded = encodeNativeMessage({ type: 'sync.hello', jobId: 'job-1' });
    expect(decoder.push(encoded.subarray(0, 3))).toEqual([]);
    expect(decoder.push(encoded.subarray(3))).toEqual([{ type: 'sync.hello', jobId: 'job-1' }]);
  });

  it('支持一个 chunk 中的多条消息', () => {
    const decoder = new NativeMessageDecoder();
    const chunk = Buffer.concat([
      encodeNativeMessage({ n: 1 }),
      encodeNativeMessage({ n: 2 }),
    ]);
    expect(decoder.push(chunk)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('拒绝超限消息', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(101, 0);
    const decoder = new NativeMessageDecoder(100);
    expect(() => decoder.push(header)).toThrow('超过限制');
  });
});
