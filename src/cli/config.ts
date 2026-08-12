import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import type { SyncConfig } from './types';
import { DEFAULT_CONFIG_PATH } from './runtime-paths';

export { DEFAULT_CONFIG_PATH } from './runtime-paths';

function isCollection(value: unknown): value is SyncConfig['collections'][number] {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && /^\d+$/.test(item.id)
    && typeof item.name === 'string' && item.name.trim().length > 0
    && (item.outputDir === undefined || (
      typeof item.outputDir === 'string'
      && item.outputDir.trim().length > 0
      && !item.outputDir.startsWith('/')
      && !item.outputDir.split(/[\\/]/).includes('..')
    ));
}

export function validateConfig(value: unknown): SyncConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('配置文件必须是 JSON 对象');
  }

  const config = value as Record<string, unknown>;
  if (config.schemaVersion !== 1) {
    throw new Error('不支持的配置版本，当前只支持 schemaVersion=1');
  }
  if (typeof config.vaultRoot !== 'string' || !config.vaultRoot.trim()) {
    throw new Error('配置缺少 vaultRoot');
  }
  if (!Array.isArray(config.collections) || !config.collections.every(isCollection)) {
    throw new Error('collections 必须是包含 id/name 的白名单数组');
  }
  if (config.extensionId !== undefined
      && (typeof config.extensionId !== 'string' || !/^[a-p]{32}$/.test(config.extensionId))) {
    throw new Error('extensionId 必须是 32 位 Chrome/Edge 扩展 ID');
  }

  return {
    schemaVersion: 1,
    vaultRoot: resolve(config.vaultRoot),
    extensionId: config.extensionId as string | undefined,
    collections: config.collections as SyncConfig['collections'],
  };
}

export async function loadConfig(path = DEFAULT_CONFIG_PATH): Promise<SyncConfig | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return validateConfig(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new Error(`配置文件不是有效 JSON: ${path}`);
    }
    throw error;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
