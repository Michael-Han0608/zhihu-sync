import { access, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DEFAULT_CONFIG_PATH } from './config';
import { createNativeHostManifest, defaultNativeManifestPath } from './native-manifest';
import { IS_WINDOWS, nativeHostExecutable, nativeLauncherPath } from './runtime-paths';
import { registerWindowsNativeHost } from './native-registration';
import { EXTENSION_ID } from '../shared/extension-identity';

export const DEFAULT_NATIVE_LAUNCHER_PATH = nativeLauncherPath();

export interface SetupOptions {
  vaultRoot?: string;
  configPath?: string;
  forceConfig?: boolean;
}

export interface SetupReport {
  nodePath: string;
  nativeHostPath: string;
  nativeManifestPath: string;
  configPath: string;
  configCreated: boolean;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildNativeLauncher(nodePath: string, hostPath: string): string {
  return [
    '#!/bin/sh',
    `exec ${shellQuote(nodePath)} ${shellQuote(hostPath)} "$@"`,
    '',
  ].join('\n');
}

export function buildWindowsNativeLauncher(nodePath: string, hostPath: string): string {
  const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  return [
    '@echo off',
    'setlocal',
    `${quote(nodePath)} ${quote(hostPath)} %*`,
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n');
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode });
  await rename(temporary, path);
  await chmod(path, mode);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function setupInstallation(options: SetupOptions = {}): Promise<SetupReport> {
  const hostPath = nativeHostExecutable();
  await access(hostPath);
  const launcherPath = DEFAULT_NATIVE_LAUNCHER_PATH;
  await atomicWrite(
    launcherPath,
    IS_WINDOWS
      ? buildWindowsNativeLauncher(process.execPath, hostPath)
      : buildNativeLauncher(process.execPath, hostPath),
    0o755,
  );

  const manifestPath = defaultNativeManifestPath();
  const manifest = createNativeHostManifest(EXTENSION_ID, launcherPath);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
  await registerWindowsNativeHost(manifestPath);

  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  let configCreated = false;
  if (options.vaultRoot) {
    const shouldWrite = options.forceConfig || !(await pathExists(configPath));
    if (shouldWrite) {
      const config = {
        schemaVersion: 1,
        vaultRoot: resolve(options.vaultRoot),
        extensionId: EXTENSION_ID,
        collections: [],
      };
      await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`, 0o600);
      configCreated = true;
    } else {
      // 确认已有配置至少可读；setup 不静默覆盖用户白名单。
      await readFile(configPath, 'utf8');
    }
  }

  return {
    nodePath: process.execPath,
    nativeHostPath: launcherPath,
    nativeManifestPath: manifestPath,
    configPath,
    configCreated,
  };
}
