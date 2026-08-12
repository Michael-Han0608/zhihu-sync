import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_WINDOWS = process.platform === 'win32';

export const DEFAULT_EDGE_USER_DATA_DIR = join(
  process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'))
    : join(homedir(), 'Library', 'Application Support'),
  'Zhihu Sync',
  'Edge',
);

export const DEFAULT_APP_DIR = process.platform === 'win32'
  ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'zhihu-sync')
  : join(homedir(), '.config', 'zhihu-sync');

export const DEFAULT_CONFIG_PATH = join(DEFAULT_APP_DIR, 'config.json');
export const DEFAULT_JOBS_DIR = join(DEFAULT_APP_DIR, 'jobs');

export function edgeExecutableCandidates(): string[] {
  if (process.platform === 'darwin') {
    return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  }
  if (process.platform === 'win32') {
    return [
      process.env['ProgramFiles(x86)']
        ? join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        : undefined,
      process.env.ProgramFiles
        ? join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        : undefined,
      process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        : undefined,
    ].filter((path): path is string => Boolean(path));
  }
  return ['microsoft-edge', 'microsoft-edge-stable'];
}

export function edgeExecutablePath(): string | undefined {
  return edgeExecutableCandidates().find((path) =>
    process.platform === 'win32' || process.platform === 'darwin'
      ? existsSync(path)
      : true,
  );
}

export function projectRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, '..'),
    resolve(moduleDir, '../..'),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    const isSourceCheckout = existsSync(join(candidate, 'src', 'manifest.ts'));
    const isInstalledPackage = existsSync(join(candidate, 'dist', 'manifest.json'))
      && existsSync(join(candidate, 'dist-cli', 'zhihu-sync-native.mjs'));
    if (existsSync(join(candidate, 'package.json'))
        && (isSourceCheckout || isInstalledPackage)) {
      return candidate;
    }
  }
  return process.cwd();
}

export function nativeHostExecutable(): string {
  return join(projectRoot(), 'dist-cli', 'zhihu-sync-native.mjs');
}

export function nativeLauncherPath(): string {
  return join(
    DEFAULT_APP_DIR,
    'bin',
    process.platform === 'win32' ? 'zhihu-sync-native.cmd' : 'zhihu-sync-native',
  );
}

export function defaultNativeManifestPath(
  edgeUserDataDir = DEFAULT_EDGE_USER_DATA_DIR,
): string {
  if (process.platform === 'win32') return join(DEFAULT_APP_DIR, 'native-manifest.json');
  return join(edgeUserDataDir, 'NativeMessagingHosts', 'com.yonghan.zhihu_sync.json');
}

export function extensionManifestPath(): string {
  return join(projectRoot(), 'dist', 'manifest.json');
}
