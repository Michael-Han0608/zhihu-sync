import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'zhihu-sync': 'src/cli/index.ts',
    'zhihu-sync-native': 'src/native-host/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist-cli',
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  sourcemap: true,
  banner: {
    // CLI 通过 npm 启动器运行；Native host 由 setup 生成的绝对 Node 路径启动器调用。
    js: '#!/usr/bin/env node',
  },
});
