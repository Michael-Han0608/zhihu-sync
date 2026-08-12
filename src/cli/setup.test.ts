import { describe, expect, it } from 'vitest';
import { buildNativeLauncher, buildWindowsNativeLauncher } from './setup';

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

describe('Windows Native host launcher', () => {
  it('preserves absolute paths and forwards the extension origin', () => {
    const script = buildWindowsNativeLauncher(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Users\\test\\AppData\\Roaming\\zhihu-sync\\bin\\zhihu-sync-native.mjs',
    );
    expect(script).toContain('@echo off');
    expect(script).toContain('"C:\\Program Files\\nodejs\\node.exe"');
    expect(script).toContain('"C:\\Users\\test\\AppData\\Roaming\\zhihu-sync\\bin\\zhihu-sync-native.mjs" %*');
    expect(script).toContain('exit /b %ERRORLEVEL%');
  });
});
