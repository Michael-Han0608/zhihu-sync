import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pathExists } from './config';
import { EXTENSION_ID } from '../shared/extension-identity';
import { edgeExecutablePath, extensionManifestPath, IS_WINDOWS, nativeHostExecutable, nativeLauncherPath } from './runtime-paths';
import { defaultNativeManifestPath } from './native-manifest';
import { isWindowsNativeHostRegistered } from './native-registration';

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
  const edgePath = edgeExecutablePath();
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
      ok: Boolean(edgePath),
      detail: edgePath || '未找到 Microsoft Edge 可执行文件',
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
    name: 'Native host 构建产物',
    ok: await pathExists(nativeHostExecutable()),
    detail: nativeHostExecutable(),
  });
  checks.push({
    name: 'Native host 启动器',
    ok: await pathExists(nativeLauncherPath()),
    detail: nativeLauncherPath(),
  });
  checks.push({
    name: 'Native Messaging manifest',
    ok: await canRead(defaultNativeManifestPath()),
    detail: defaultNativeManifestPath(),
  });
  if (IS_WINDOWS) {
    checks.push({
      name: 'Native Messaging 注册表',
      ok: await isWindowsNativeHostRegistered(defaultNativeManifestPath()),
      detail: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.yonghan.zhihu_sync',
    });
  }

  return checks;
}

export function formatDoctorChecks(checks: DoctorCheck[]): string {
  return checks
    .map((check) => `${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`)
    .join('\n');
}
