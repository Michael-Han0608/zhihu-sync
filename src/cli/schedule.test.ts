import { describe, expect, it } from 'vitest';
import { buildSchedulePlist, buildWindowsScheduleCommand, SCHEDULE_LABEL } from './schedule';

describe('launchd schedule', () => {
  it('生成固定时间且不启用评论的同步任务', () => {
    const plist = buildSchedulePlist(4, 30);
    expect(plist).toContain(`<string>${SCHEDULE_LABEL}</string>`);
    expect(plist).toContain('<integer>4</integer>');
    expect(plist).toContain('<integer>30</integer>');
    expect(plist).toContain('<string>sync</string>');
    expect(plist).not.toContain('--comments');
    expect(plist).toContain(process.execPath);
  });

  it('拒绝无效时间', () => {
    expect(() => buildSchedulePlist(24, 0)).toThrow('hour');
    expect(() => buildSchedulePlist(1, 60)).toThrow('minute');
  });
});

describe('Windows Task Scheduler', () => {
  it('生成当前 Node 和构建后 CLI 的 Windows 命令', () => {
    const command = buildWindowsScheduleCommand();
    expect(command).toContain('dist-cli');
    expect(command).toContain('zhihu-sync.mjs');
    expect(command).toContain(' sync');
    const separator = process.platform === 'win32' ? '\\' : '/';
    expect(command).toContain(`dist-cli${separator}zhihu-sync.mjs`);
    if (process.platform === 'win32') expect(command).not.toContain('\\\\Users');
  });
});
