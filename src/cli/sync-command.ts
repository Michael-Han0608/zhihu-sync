import { spawn } from 'node:child_process';
import { access, readFile, statfs, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createSyncJob, markJobFailed, readJobStatus, type SyncJobStatus } from './job';
import { DEFAULT_EDGE_USER_DATA_DIR, projectRoot } from './runtime-paths';
import { EXTENSION_ID } from '../shared/extension-identity';
import type { SyncMode } from '../shared/native-messages';

const EDGE_EXECUTABLE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

export interface RunSyncOptions {
  configPath: string;
  dryRun: boolean;
  comments: boolean;
  collectionIds: string[];
  json: boolean;
  showBrowser: boolean;
  mode: SyncMode;
  maxPages: number;
  timeoutMinutes: number;
  minFreeGb: number;
}

export function writeSyncProgress(message: string, json: boolean): void {
  (json ? process.stderr : process.stdout).write(message);
}

function formatStatus(status: SyncJobStatus): string {
  const lines = [
    status.dryRun
      ? `${status.mode === 'votes' ? '赞同回答' : '知乎收藏夹'}增量预检（只读）`
      : `${status.mode === 'votes' ? '赞同回答' : '知乎收藏夹'}增量同步完成`,
    '',
  ];
  for (const item of status.collections) {
    lines.push(`${item.name} (${item.id})`);
    lines.push(`  远端报告 ${item.remoteTotal}，实际返回 ${item.remoteSeen}，支持 ${item.supported}，新增 ${item.newCount}，更新 ${item.updateCount}，不变 ${item.unchangedCount}`);
    lines.push(`  本地独有 ${item.localOnlyCount}（保留），跳过不支持 ${item.skippedUnsupported}，跳过付费 ${item.skippedPaid}`);
    if (!status.dryRun) lines.push(`  已写入 ${item.written}，评论覆盖 ${item.commentsWritten}`);
    if (item.newIds.length && item.newIds.length <= 20) lines.push(`  新增 ID: ${item.newIds.join(', ')}`);
    if (item.newIds.length > 20) lines.push(`  新增 ID 已记录于任务状态文件（共 ${item.newIds.length} 个）`);
    if (item.updateIds.length && item.updateIds.length <= 20) lines.push(`  更新 ID: ${item.updateIds.join(', ')}`);
    if (item.updateIds.length > 20) lines.push(`  更新 ID 已记录于任务状态文件（共 ${item.updateIds.length} 个）`);
  }
  lines.push('', status.dryRun ? '结论：本次没有写入资料库。' : '结论：同步完成；未删除任何本地内容。');
  return lines.join('\n');
}

interface EdgeController {
  close(): Promise<void>;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForDevToolsPort(): Promise<{ port: number; browserPath: string }> {
  const path = join(DEFAULT_EDGE_USER_DATA_DIR, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const [portLine, browserPath] = (await readFile(path, 'utf8')).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0 && browserPath) return { port, browserPath };
    } catch { /* Edge 尚未写入端口文件 */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('专用 Edge 启动超时；请先关闭遗留的 Zhihu Sync 窗口后重试');
}

function cdpCommand(
  websocketUrl: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Edge 控制命令超时: ${method}`));
    }, 10_000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method, params }));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: Record<string, unknown>;
        error?: { message?: string };
      };
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.error) reject(new Error(message.error.message || `Edge 控制命令失败: ${method}`));
      else resolve(message.result || {});
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`无法连接专用 Edge: ${method}`));
    });
  });
}

async function launchEdge(jobId: string, showBrowser: boolean): Promise<EdgeController> {
  const extensionDir = join(projectRoot(), 'dist');
  const devToolsPortPath = join(DEFAULT_EDGE_USER_DATA_DIR, 'DevToolsActivePort');
  await unlink(devToolsPortPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  const browserArgs = [
    `--user-data-dir=${DEFAULT_EDGE_USER_DATA_DIR}`,
    '--no-first-run',
    '--disable-default-apps',
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
  ];
  if (!showBrowser) browserArgs.push('--headless=new');
  browserArgs.push('https://www.zhihu.com/');
  const child = spawn(EDGE_EXECUTABLE, browserArgs, { detached: true, stdio: 'ignore' });
  child.unref();
  try {
    const { port, browserPath } = await waitForDevToolsPort();
    const browserSocket = `ws://127.0.0.1:${port}${browserPath}`;
    await cdpCommand(browserSocket, 'Extensions.loadUnpacked', { path: extensionDir });
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Array<{
      type: string;
      url: string;
      webSocketDebuggerUrl: string;
    }>;
    const zhihuPage = pages.find((item) => item.type === 'page' && item.url.startsWith('https://www.zhihu.com/'));
    if (!zhihuPage) throw new Error('专用 Edge 未能打开知乎代理页面');
    await cdpCommand(zhihuPage.webSocketDebuggerUrl, 'Page.reload', { ignoreCache: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const target = `chrome-extension://${EXTENSION_ID}/src/sync/index.html?job=${encodeURIComponent(jobId)}`;
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target)}`, { method: 'PUT' });
    if (!response.ok) throw new Error(`无法打开同步页面: HTTP ${response.status}`);
    return {
      close: async () => {
        await cdpCommand(browserSocket, 'Browser.close').catch(() => undefined);
        for (let attempt = 0; attempt < 20 && processExists(child.pid!); attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (child.pid && processExists(child.pid)) child.kill('SIGTERM');
      },
    };
  } catch (error) {
    if (child.pid && processExists(child.pid)) child.kill('SIGTERM');
    throw error;
  }
}

export async function runSyncCommand(options: RunSyncOptions): Promise<SyncJobStatus> {
  await access(EDGE_EXECUTABLE);
  const configRaw = JSON.parse(await readFile(options.configPath, 'utf8')) as { vaultRoot?: string };
  if (!configRaw.vaultRoot) throw new Error(`配置缺少 vaultRoot: ${options.configPath}`);
  const disk = await statfs(configRaw.vaultRoot);
  const freeGb = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  if (!options.dryRun && freeGb < options.minFreeGb) {
    throw new Error(`磁盘可用空间仅 ${freeGb.toFixed(1)}GB，低于安全线 ${options.minFreeGb}GB；未启动同步`);
  }
  const job = await createSyncJob({
    configPath: options.configPath,
    dryRun: options.dryRun,
    comments: options.comments,
    mode: options.mode,
    maxPages: options.maxPages,
    minFreeGb: options.minFreeGb,
    collectionIds: options.collectionIds,
  });
  writeSyncProgress(`任务 ${job.id}\n`, options.json);
  writeSyncProgress(options.mode === 'votes'
    ? '正在通过专用 Edge 读取赞同回答动态…\n'
    : '正在通过专用 Edge 读取白名单收藏夹…\n', options.json);
  let edge: EdgeController | null = null;
  const startedAt = Date.now();
  const startupDeadline = startedAt + 30_000;
  const deadline = startedAt + options.timeoutMinutes * 60_000;

  try {
    edge = await launchEdge(job.id, options.showBrowser);
    let shownLogs = 0;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const status = await readJobStatus(job.id);
      if (!options.json) {
        for (const entry of status.logs.slice(shownLogs)) {
          process.stdout.write(`[${entry.level}] ${entry.message}\n`);
        }
        shownLogs = status.logs.length;
      }
      if (status.state === 'pending' && Date.now() > startupDeadline) {
        throw new Error('Native host 在 30 秒内未启动');
      }
      if (Date.now() > deadline) {
        throw new Error(`同步超过 ${options.timeoutMinutes} 分钟，已安全终止`);
      }
      if (status.state === 'failed') throw new Error(status.error || '同步失败');
      if (status.state === 'completed') {
        process.stdout.write(options.json
          ? `${JSON.stringify(status, null, 2)}\n`
          : `${formatStatus(status)}\n`);
        return status;
      }
    }
  } catch (error) {
    await markJobFailed(job.id, error).catch(() => undefined);
    throw error;
  } finally {
    await edge?.close();
  }
}
