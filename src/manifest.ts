import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';
import { EXTENSION_PUBLIC_KEY } from './shared/extension-identity';

export default defineManifest({
  manifest_version: 3,
  name: 'Zhihu Sync（本机归档版）',
  description: '使用 Native Messaging 将知乎收藏夹增量归档到本地 Obsidian',
  version: pkg.version,
  key: EXTENSION_PUBLIC_KEY,
  permissions: ['activeTab', 'storage', 'unlimitedStorage', 'scripting', 'nativeMessaging'],
  host_permissions: [
    'https://www.zhihu.com/*',
    'https://zhuanlan.zhihu.com/*',
  ],
  background: {
    service_worker: 'src/background/index.ts',
  },
  icons: {
    '16': 'src/assets/icons/icon16.png',
    '48': 'src/assets/icons/icon48.png',
    '128': 'src/assets/icons/icon128.png',
  },
  content_scripts: [
    {
      matches: [
        'https://www.zhihu.com/*',
        'https://zhuanlan.zhihu.com/*',
      ],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/assets/icons/icon48.png', 'src/content/fetch-bridge.js'],
      matches: ['https://www.zhihu.com/*', 'https://zhuanlan.zhihu.com/*'],
    },
  ],
});
