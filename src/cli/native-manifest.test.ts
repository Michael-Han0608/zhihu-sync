// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createNativeHostManifest } from './native-manifest';

describe('createNativeHostManifest', () => {
  it('只允许确切扩展 ID 和绝对 host 路径', () => {
    const id = 'abcdefghijklmnopabcdefghijklmnop';
    const manifest = createNativeHostManifest(id, '/tmp/zhihu-sync-native');
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${id}/`]);
    expect(manifest.type).toBe('stdio');
  });

  it('拒绝非法扩展 ID', () => {
    expect(() => createNativeHostManifest('not-an-id', '/tmp/host')).toThrow('32 位');
  });

  it('拒绝相对 host 路径', () => {
    const id = 'abcdefghijklmnopabcdefghijklmnop';
    expect(() => createNativeHostManifest(id, './host')).toThrow('绝对路径');
  });
});
