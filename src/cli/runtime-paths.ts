import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_EDGE_USER_DATA_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'Zhihu Sync',
  'Edge',
);

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

export function extensionManifestPath(): string {
  return join(projectRoot(), 'dist', 'manifest.json');
}
