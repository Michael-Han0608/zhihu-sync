import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NATIVE_HOST_NAME } from '../shared/native-messages';

const execFileAsync = promisify(execFile);

export const WINDOWS_NATIVE_REGISTRY_KEY =
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;

export function windowsNativeRegistryArgs(manifestPath: string): string[] {
  return [
    'ADD', WINDOWS_NATIVE_REGISTRY_KEY, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f',
  ];
}

export async function registerWindowsNativeHost(manifestPath: string): Promise<void> {
  if (process.platform !== 'win32') return;
  await execFileAsync('reg.exe', windowsNativeRegistryArgs(manifestPath), { windowsHide: true });
}

export async function isWindowsNativeHostRegistered(manifestPath: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['QUERY', WINDOWS_NATIVE_REGISTRY_KEY, '/ve'],
      { windowsHide: true },
    );
    return stdout.toLowerCase().includes(manifestPath.toLowerCase());
  } catch {
    return false;
  }
}
