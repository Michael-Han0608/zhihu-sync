import { execFile } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { projectRoot } from './runtime-paths';

const execFileAsync = promisify(execFile);
export const SCHEDULE_LABEL = 'com.yonghan.zhihu-sync';
export const SCHEDULE_PATH = join(homedir(), 'Library', 'LaunchAgents', `${SCHEDULE_LABEL}.plist`);

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSchedulePlist(hour: number, minute: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('hour 必须是 0-23 的整数');
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('minute 必须是 0-59 的整数');
  const root = projectRoot();
  const logDir = join(homedir(), 'Library', 'Logs', 'Zhihu Sync');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SCHEDULE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(join(root, 'dist-cli', 'zhihu-sync.mjs'))}</string>
    <string>sync</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(root)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(logDir, 'sync.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(logDir, 'sync-error.log'))}</string>
</dict>
</plist>
`;
}

export async function installSchedule(hour = 4, minute = 30): Promise<void> {
  const logDir = join(homedir(), 'Library', 'Logs', 'Zhihu Sync');
  await mkdir(dirname(SCHEDULE_PATH), { recursive: true });
  await mkdir(logDir, { recursive: true });
  const temporary = `${SCHEDULE_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, buildSchedulePlist(hour, minute), { mode: 0o644 });
  await rename(temporary, SCHEDULE_PATH);
  const domain = `gui/${process.getuid?.() ?? 501}`;
  await execFileAsync('/bin/launchctl', ['bootout', domain, SCHEDULE_PATH]).catch(() => undefined);
  await execFileAsync('/bin/launchctl', ['bootstrap', domain, SCHEDULE_PATH]);
  await execFileAsync('/bin/launchctl', ['enable', `${domain}/${SCHEDULE_LABEL}`]);
}

export async function uninstallSchedule(): Promise<void> {
  const domain = `gui/${process.getuid?.() ?? 501}`;
  await execFileAsync('/bin/launchctl', ['bootout', domain, SCHEDULE_PATH]).catch(() => undefined);
  await rm(SCHEDULE_PATH, { force: true });
}

export async function scheduleStatus(): Promise<string> {
  const domain = `gui/${process.getuid?.() ?? 501}`;
  try {
    const { stdout } = await execFileAsync('/bin/launchctl', ['print', `${domain}/${SCHEDULE_LABEL}`]);
    return stdout;
  } catch {
    return '未安装';
  }
}
