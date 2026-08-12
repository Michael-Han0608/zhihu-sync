import { describe, expect, it } from 'vitest';
import { buildNativeLauncher } from './setup';

describe('buildNativeLauncher', () => {
  it('使用安装时 Node 绝对路径启动 Native host', () => {
    const script = buildNativeLauncher(
      "/Users/test/Node's/bin/node",
      '/Users/test/Zhihu Sync/zhihu-sync-native.mjs',
    );
    expect(script).toContain('#!/bin/sh');
    expect(script).toContain("'/Users/test/Node'\"'\"'s/bin/node'");
    expect(script).toContain("'/Users/test/Zhihu Sync/zhihu-sync-native.mjs'");
    expect(script).toContain('"$@"');
  });
});
