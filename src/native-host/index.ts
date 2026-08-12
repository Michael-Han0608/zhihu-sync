import { loadConfig } from '../cli/config';
import {
  appendJobLog,
  readJobStatus,
  readSyncJob,
  writeJobStatus,
  type SyncJobStatus,
} from '../cli/job';
import {
  NATIVE_PROTOCOL_VERSION,
  type ExtensionToNativeMessage,
  type NativeToExtensionMessage,
  type SyncReadyMessage,
} from '../shared/native-messages';
import { EXTENSION_ID } from '../shared/extension-identity';
import {
  createArchiveContext,
  planCatalog,
  writeContent,
  type CollectionArchiveContext,
} from './archive';
import { encodeNativeMessage, NativeMessageDecoder } from './protocol';
import { readVoteState, writeVoteState, type VoteSyncState } from './vote-state';
import { statfs } from 'node:fs/promises';

interface Runtime {
  jobId: string;
  dryRun: boolean;
  comments: boolean;
  status: SyncJobStatus;
  collections: SyncReadyMessage['collections'];
  contexts: Map<string, CollectionArchiveContext>;
  voteState?: VoteSyncState;
  vaultRoot: string;
  minFreeGb: number;
}

let runtime: Runtime | null = null;

function writeMessage(message: NativeToExtensionMessage): void {
  if (process.stdout.destroyed) return;
  process.stdout.write(encodeNativeMessage(message));
}

function errorMessage(error: unknown, jobId?: string): NativeToExtensionMessage {
  return {
    type: 'sync.error',
    jobId,
    code: 'SYNC_FAILED',
    message: error instanceof Error ? error.message : String(error),
  };
}

function assertJobMessage(message: { jobId?: string }): Runtime {
  if (!runtime || message.jobId !== runtime.jobId) throw new Error('任务编号不匹配');
  return runtime;
}

async function failJob(error: unknown, jobId?: string): Promise<void> {
  if (runtime && (!jobId || jobId === runtime.jobId)) {
    runtime.status.state = 'failed';
    runtime.status.error = error instanceof Error ? error.message : String(error);
    await appendJobLog(runtime.status, 'error', runtime.status.error);
    return;
  }
  if (jobId && /^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
    try {
      const status = await readJobStatus(jobId);
      status.state = 'failed';
      status.error = error instanceof Error ? error.message : String(error);
      await appendJobLog(status, 'error', status.error);
    } catch { /* 连任务文件都不可读时只能写 stderr */ }
  }
}

async function handleHello(message: ExtensionToNativeMessage & { type: 'sync.hello' }): Promise<NativeToExtensionMessage> {
  if (message.protocolVersion !== NATIVE_PROTOCOL_VERSION
      || !/^[a-zA-Z0-9_-]{1,128}$/.test(message.jobId)) {
    throw new Error('不支持的协议或 jobId');
  }
  const job = await readSyncJob(message.jobId);
  const config = await loadConfig(job.configPath);
  if (!config) throw new Error(`找不到配置文件: ${job.configPath}`);
  const requested = new Set(job.collectionIds || []);
  const selected = job.mode === 'votes'
    ? [{ id: 'votes', name: '赞同的回答', outputDir: '赞同的回答' }]
    : config.collections.filter((item) => requested.size === 0 || requested.has(item.id));
  if (job.mode !== 'votes' && requested.size > 0 && selected.length !== requested.size) {
    const unknown = [...requested].filter((id) => !config.collections.some((item) => item.id === id));
    throw new Error(`收藏夹不在白名单中: ${unknown.join(', ')}`);
  }
  if (selected.length === 0) throw new Error('没有可同步的白名单收藏夹');

  const status = await readJobStatus(job.id);
  status.state = 'running';
  await writeJobStatus(status);
  const voteState = job.mode === 'votes' ? await readVoteState(config.vaultRoot) : undefined;
  const collections = selected.map((item) => ({
    id: item.id,
    name: item.name,
    apiUrl: item.id === 'votes'
      ? ''
      : `https://www.zhihu.com/api/v4/collections/${item.id}/items?offset=0&limit=20`,
  }));
  runtime = {
    jobId: job.id,
    dryRun: job.dryRun,
    comments: job.comments,
    status,
    collections,
    contexts: new Map(),
    voteState,
    vaultRoot: config.vaultRoot,
    minFreeGb: job.minFreeGb,
  };
  await appendJobLog(status, 'info', job.mode === 'votes'
    ? '已连接专用扩展；同步赞同回答'
    : `已连接专用扩展；同步 ${selected.length} 个白名单收藏夹`);
  return {
    type: 'sync.ready',
    protocolVersion: NATIVE_PROTOCOL_VERSION,
    jobId: job.id,
    dryRun: job.dryRun,
    comments: job.comments,
    mode: job.mode,
    maxPages: job.maxPages,
    minFreeGb: job.minFreeGb,
    collections,
    votes: voteState ? {
      startUrl: voteState.backfillCursor || undefined,
      knownActivityIds: voteState.newestActivityIds,
      backfillInProgress: Boolean(voteState.backfillCursor),
    } : undefined,
  };
}

async function handleMessage(message: ExtensionToNativeMessage): Promise<NativeToExtensionMessage | null> {
  if (message.type === 'sync.hello') return handleHello(message);
  const current = assertJobMessage(message);

  if (message.type === 'sync.event') {
    await appendJobLog(current.status, message.level, message.message);
    return null;
  }

  if (message.type === 'sync.failed') {
    throw new Error(message.message);
  }

  if (message.type === 'sync.catalog') {
    const spec = current.collections.find((item) => item.id === message.collectionId);
    if (!spec) throw new Error(`收藏夹不在本次白名单中: ${message.collectionId}`);
    const config = await loadConfig((await readSyncJob(current.jobId)).configPath);
    if (!config) throw new Error('配置文件消失');
    const collection = spec.id === 'votes'
      ? { id: 'votes', name: '赞同的回答', outputDir: '赞同的回答' }
      : config.collections.find((item) => item.id === spec.id);
    if (!collection) throw new Error(`配置中找不到收藏夹: ${spec.id}`);
    const context = await createArchiveContext(config, collection);
    const result = planCatalog(context, message.items, {
      ...message,
      completeSnapshot: spec.id !== 'votes',
    });
    current.contexts.set(spec.id, context);
    const existing = current.status.collections.find((item) => item.id === spec.id);
    const summary = {
      id: spec.id,
      name: spec.name,
      remoteTotal: result.remoteTotal,
      remoteSeen: result.remoteSeen,
      supported: result.supported,
      newCount: result.newCount,
      updateCount: result.updateCount,
      unchangedCount: result.unchangedCount,
      localOnlyCount: result.localOnlyCount,
      skippedUnsupported: result.skippedUnsupported,
      skippedPaid: result.skippedPaid,
      written: existing?.written || 0,
      commentsWritten: existing?.commentsWritten || 0,
      newIds: result.actions.filter((item) => item.action === 'new').map((item) => item.id),
      updateIds: result.actions.filter((item) => item.action === 'update').map((item) => item.id),
    };
    if (existing) Object.assign(existing, summary);
    else current.status.collections.push(summary);
    await appendJobLog(
      current.status,
      'info',
      `${spec.name}: 新增 ${result.newCount}，更新 ${result.updateCount}，不变 ${result.unchangedCount}，本地独有 ${result.localOnlyCount}`,
    );
    if (spec.id === 'votes' && current.voteState) {
      const checkpointIds = message.checkpointActivityIds || [];
      if (checkpointIds.length) {
        current.voteState.newestActivityIds = checkpointIds.slice(0, 20);
      }
      current.voteState.backfillCursor = message.historyComplete ? null : (message.nextCursor || null);
      current.voteState.historyComplete = Boolean(message.historyComplete);
    }
    return {
      type: 'sync.plan',
      jobId: current.jobId,
      collectionId: spec.id,
      actions: result.actions,
      summary: result,
    };
  }

  if (message.type === 'sync.content') {
    if (current.dryRun) throw new Error('dry-run 任务拒绝写入内容');
    const disk = await statfs(current.vaultRoot);
    const freeGb = Number(disk.bavail * disk.bsize) / 1024 ** 3;
    if (freeGb < current.minFreeGb) {
      throw new Error(`磁盘可用空间仅 ${freeGb.toFixed(1)}GB，低于安全线 ${current.minFreeGb}GB；断点未推进`);
    }
    const context = current.contexts.get(message.collectionId);
    if (!context) throw new Error(`尚未生成收藏夹计划: ${message.collectionId}`);
    const result = await writeContent(context, message.payload);
    const summary = current.status.collections.find((item) => item.id === message.collectionId);
    if (summary) {
      summary.written++;
      if (result.commentsWritten) summary.commentsWritten++;
    }
    const planned = summary ? summary.newCount + summary.updateCount : 0;
    const compactVoteProgress = message.collectionId === 'votes'
      && summary
      && summary.written % 25 !== 0
      && summary.written !== planned;
    if (!compactVoteProgress) {
      await appendJobLog(
        current.status,
        'info',
        message.collectionId === 'votes' && summary
          ? `赞同回答写入进度 ${summary.written}/${planned}`
          : `${result.action === 'new' ? '新增' : '更新'} ${message.payload.item.title || message.payload.item.id}`,
      );
    } else {
      await writeJobStatus(current.status);
    }
    return {
      type: 'sync.content-result',
      jobId: current.jobId,
      collectionId: message.collectionId,
      id: message.payload.item.id,
      action: result.action,
      path: result.path,
    };
  }

  if (message.type === 'sync.complete') {
    if (!current.dryRun) {
      const remaining = [...current.contexts.values()].reduce((sum, item) => sum + item.actionById.size, 0);
      if (remaining > 0) throw new Error(`仍有 ${remaining} 个计划条目未写入，拒绝标记完成`);
    }
    current.status.state = 'completed';
    if (current.voteState && !current.dryRun) {
      await writeVoteState(current.vaultRoot, current.voteState);
    }
    await appendJobLog(current.status, 'info', current.dryRun ? '只读预检完成' : '同步完成；未删除本地内容');
    process.stderr.write(`zhihu-sync-native: completed job=${current.jobId}\n`);
    return { type: 'sync.completed', jobId: current.jobId };
  }

  throw new Error('不支持的消息类型');
}

async function main(): Promise<void> {
  const origin = process.argv[2] || '';
  const expectedOrigin = `chrome-extension://${EXTENSION_ID}/`;
  if (origin !== expectedOrigin) throw new Error(`未授权的扩展来源: ${origin || 'missing'}`);

  const decoder = new NativeMessageDecoder();
  let queue = Promise.resolve();
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`zhihu-sync-native: stdout error: ${error.message}\n`);
    process.exitCode = 1;
  });
  process.stdin.on('data', (chunk: Buffer) => {
    try {
      for (const message of decoder.push(chunk) as ExtensionToNativeMessage[]) {
        queue = queue.then(async () => {
          try {
            const response = await handleMessage(message);
            if (response) writeMessage(response);
          } catch (error) {
            await failJob(error, 'jobId' in message ? message.jobId : undefined);
            writeMessage(errorMessage(error, 'jobId' in message ? message.jobId : undefined));
          }
        });
      }
    } catch (error) {
      void failJob(error);
      process.stderr.write(`zhihu-sync-native: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
  });
}

main().catch((error) => {
  process.stderr.write(`zhihu-sync-native: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
