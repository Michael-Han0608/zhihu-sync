import { isAbsolute, join } from 'node:path';
import { NATIVE_HOST_NAME } from '../shared/native-messages';
import { DEFAULT_EDGE_USER_DATA_DIR, defaultNativeManifestPath as runtimeNativeManifestPath } from './runtime-paths';

export interface NativeHostManifest {
  name: string;
  description: string;
  path: string;
  type: 'stdio';
  allowed_origins: string[];
}

export function createNativeHostManifest(
  extensionId: string,
  hostPath: string,
): NativeHostManifest {
  if (!/^[a-p]{32}$/.test(extensionId)) {
    throw new Error('extensionId 必须是 32 位 a-p 字符');
  }
  if (!isAbsolute(hostPath)) {
    throw new Error('Native Messaging host path 必须是绝对路径');
  }
  return {
    name: NATIVE_HOST_NAME,
    description: 'Zhihu Sync local archive host',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

export function defaultNativeManifestPath(
  edgeUserDataDir = DEFAULT_EDGE_USER_DATA_DIR,
): string {
  return runtimeNativeManifestPath(edgeUserDataDir);
}
