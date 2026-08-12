import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pathExists } from './config';
import { EXTENSION_ID } from '../shared/extension-identity';
import { extensionManifestPath } from './runtime-paths';
import { nativeHostExecutable } from './runtime-paths';
import { defaultNativeManifestPath } from './native-manifest';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

async function canRead(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(vaultRoot?: string, configPath?: string): Promise<DoctorCheck[]> {
  const edgePath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  const checks: DoctorCheck[] = [
    {
      name: 'Node.js',
      ok: Number(process.versions.node.split('.')[0]) >= 22,
      detail: process.version,
    },
    {
      name: '固定扩展 ID',
      ok: /^[a-p]{32}$/.test(EXTENSION_ID),
      detail: EXTENSION_ID,
    },
    {
      name: 'Microsoft Edge',
      ok: await pathExists(edgePath),
      detail: edgePath,
    },
  ];

  if (vaultRoot) {
    checks.push({
      name: 'Zhihu vault',
      ok: await canRead(vaultRoot),
      detail: vaultRoot,
    });
  }

  if (configPath) {
    checks.push({
      name: '配置文件',
      ok: await canRead(configPath),
      detail: configPath,
    });
  }

  const extensionDist = extensionManifestPath();
  checks.push({
    name: '扩展构建产物',
    ok: await pathExists(extensionDist),
    detail: extensionDist,
  });
  checks.push({
    name: 'Native host 可执行文件',
    ok: await pathExists(nativeHostExecutable()),
    detail: nativeHostExecutable(),
  });
  checks.push({
    name: 'Native Messaging manifest',
    ok: await canRead(defaultNativeManifestPath()),
    detail: defaultNativeManifestPath(),
  });

  return checks;
}

export function formatDoctorChecks(checks: DoctorCheck[]): string {
  return checks
    .map((check) => `${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`)
    .join('\n');
}
