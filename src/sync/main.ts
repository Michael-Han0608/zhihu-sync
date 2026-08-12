import {
  fetchAllComments,
  fetchCollectionPage,
  fetchFullContent,
  fetchVoteActivityPage,
} from '@/shared/api/zhihu-api';
import {
  buildCommentsMarkdown,
  extractImageUrls,
  htmlToMarkdown,
  inferImageExtension,
} from '@/shared/converters/html-to-markdown';
import {
  NATIVE_HOST_NAME,
  NATIVE_PROTOCOL_VERSION,
  type CatalogItem,
  type ExtensionToNativeMessage,
  type NativeToExtensionMessage,
  type SyncContentPayload,
  type SyncPlanMessage,
  type SyncReadyMessage,
} from '@/shared/native-messages';
import { buildFrontmatter, collectCommentImageEntries } from '@/shared/utils/export-utils';
import type { ContentItem, ZhihuComment } from '@/types/zhihu';
import { fetchVoteCatalog } from './votes';

const status = document.querySelector<HTMLElement>('#status');
const log = document.querySelector<HTMLElement>('#log');
const params = new URLSearchParams(window.location.search);
const jobId = params.get('job');
let activePort: chrome.runtime.Port | null = null;
let finished = false;

function setStatus(message: string, isError = false): void {
  if (status) {
    status.textContent = message;
    status.style.color = isError ? '#b42318' : '#176b3a';
  }
  if (log) log.textContent += `${new Date().toLocaleTimeString('zh-CN')} ${message}\n`;
}

function catalogItem(item: ContentItem): CatalogItem {
  const { html: _html, ...rest } = item;
  return rest;
}

function imagePlan(itemId: string, html: string): {
  mapping: Record<string, string>;
  images: Array<{ url: string; relativePath: string }>;
} {
  const mapping: Record<string, string> = {};
  const images = extractImageUrls(html).map((url, index) => {
    const relativePath = `images/${itemId}_${String(index + 1).padStart(3, '0')}${inferImageExtension(url)}`;
    mapping[url] = relativePath;
    return { url, relativePath };
  });
  return { mapping, images };
}

function commentImagePlan(itemId: string, comments: ZhihuComment[]): {
  mapping: Record<string, string>;
  images: Array<{ url: string; relativePath: string }>;
} {
  const mapping: Record<string, string> = {};
  const images: Array<{ url: string; relativePath: string }> = [];
  for (const entry of collectCommentImageEntries(comments)) {
    entry.urls.forEach((url, index) => {
      const relativePath = `images/comment_${itemId}_${String(entry.commentIdx).padStart(3, '0')}_${String(index + 1).padStart(3, '0')}${inferImageExtension(url)}`;
      mapping[url] = relativePath;
      images.push({ url, relativePath });
    });
  }
  return { mapping, images };
}

async function fetchCatalog(apiUrl: string): Promise<{
  items: ContentItem[];
  remoteTotal: number;
  remoteSeen: number;
  skippedUnsupported: number;
  skippedPaid: number;
}> {
  const byId = new Map<string, ContentItem>();
  let nextUrl: string | null = apiUrl;
  let remoteTotal = 0;
  let remoteSeen = 0;
  let skippedUnsupported = 0;
  let skippedPaid = 0;
  while (nextUrl) {
    const result = await fetchCollectionPage(nextUrl);
    remoteTotal = Math.max(remoteTotal, result.totals, byId.size + result.items.length);
    remoteSeen += result.items.length;
    for (const item of result.items) {
      if (!['article', 'answer'].includes(item.type)) {
        skippedUnsupported++;
        continue;
      }
      if (item.isPaidContent) {
        skippedPaid++;
        continue;
      }
      if (item.id) byId.set(item.id, item);
    }
    setStatus(`读取目录：${byId.size} 篇可归档内容`);
    nextUrl = result.nextUrl;
  }
  return { items: [...byId.values()], remoteTotal, remoteSeen, skippedUnsupported, skippedPaid };
}

async function getCurrentUserToken(): Promise<string> {
  const response = await chrome.runtime.sendMessage({ action: 'getCurrentUserToken' });
  if (!response?.ok || typeof response.token !== 'string' || !response.token) {
    throw new Error(response?.error || '无法识别当前知乎账号');
  }
  return response.token;
}

async function fetchVotes(ready: SyncReadyMessage): Promise<{
  items: ContentItem[];
  remoteTotal: number;
  remoteSeen: number;
  skippedUnsupported: number;
  skippedPaid: number;
  nextCursor: string | null;
  historyComplete: boolean;
  checkpointActivityIds: string[];
}> {
  const token = await getCurrentUserToken();
  return fetchVoteCatalog({
    token,
    votes: ready.votes,
    maxPages: ready.maxPages,
    fetchPage: fetchVoteActivityPage,
    onProgress: setStatus,
  });
}

async function buildPayload(item: ContentItem, commentsEnabled: boolean): Promise<SyncContentPayload> {
  let html = item.html || '';
  if (item.isTruncated && item.url) {
    const full = await fetchFullContent(item.type, item.url);
    if (full && full.length > html.length) html = full;
  }
  const articleImages = imagePlan(item.id, html);
  const markdown = buildFrontmatter(item) + htmlToMarkdown(html, articleImages.mapping);
  const payload: SyncContentPayload = {
    item: catalogItem(item),
    markdown,
    images: articleImages.images,
  };
  if (commentsEnabled) {
    const comments = await fetchAllComments(item.type, item.id);
    const commentImages = commentImagePlan(item.id, comments);
    payload.commentsMarkdown = buildCommentsMarkdown(comments, item.title || item.id, commentImages.mapping);
    payload.commentImages = commentImages.images;
  }
  return payload;
}

function waitForMessage<T extends NativeToExtensionMessage>(
  port: chrome.runtime.Port,
  predicate: (message: NativeToExtensionMessage) => message is T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = (message: NativeToExtensionMessage) => {
      if (message.type === 'sync.error') {
        port.onMessage.removeListener(listener);
        reject(new Error(message.message));
      } else if (predicate(message)) {
        port.onMessage.removeListener(listener);
        resolve(message);
      }
    };
    port.onMessage.addListener(listener);
  });
}

function send(port: chrome.runtime.Port, message: ExtensionToNativeMessage): void {
  port.postMessage(message);
}

async function run(): Promise<void> {
  if (!jobId || !/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
    setStatus('缺少有效 job 参数，已停止。', true);
    return;
  }
  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  activePort = port;
  const disconnected = new Promise<never>((_resolve, reject) => {
    port.onDisconnect.addListener(() => {
      if (!finished) reject(new Error(chrome.runtime.lastError?.message || 'Native Messaging 连接已断开'));
    });
  });

  const readyPromise = waitForMessage(port, (message): message is SyncReadyMessage =>
    message.type === 'sync.ready' && message.jobId === jobId);
  send(port, { type: 'sync.hello', protocolVersion: NATIVE_PROTOCOL_VERSION, jobId });
  const ready = await Promise.race([readyPromise, disconnected]);
  setStatus(`本地管道已就绪；${ready.dryRun ? '只读预检' : '正式同步'}`);

  for (const collection of ready.collections) {
    send(port, { type: 'sync.event', jobId, level: 'info', message: `开始读取 ${collection.name}` });
    const catalog = ready.mode === 'votes'
      ? await fetchVotes(ready)
      : await fetchCatalog(collection.apiUrl);
    const itemById = new Map(catalog.items.map((item) => [item.id, item]));
    const planPromise = waitForMessage(port, (message): message is SyncPlanMessage =>
      message.type === 'sync.plan'
      && message.jobId === jobId
      && message.collectionId === collection.id);
    const voteFields = ready.mode === 'votes'
      ? {
        nextCursor: (catalog as Awaited<ReturnType<typeof fetchVotes>>).nextCursor,
        historyComplete: (catalog as Awaited<ReturnType<typeof fetchVotes>>).historyComplete,
        checkpointActivityIds: (catalog as Awaited<ReturnType<typeof fetchVotes>>).checkpointActivityIds,
      }
      : {};
    send(port, {
      type: 'sync.catalog',
      jobId,
      collectionId: collection.id,
      items: catalog.items.map(catalogItem),
      remoteTotal: catalog.remoteTotal,
      remoteSeen: catalog.remoteSeen,
      skippedUnsupported: catalog.skippedUnsupported,
      skippedPaid: catalog.skippedPaid,
      ...voteFields,
    });
    const plan = await Promise.race([planPromise, disconnected]);
    setStatus(`${collection.name}：新增 ${plan.summary.newCount}，更新 ${plan.summary.updateCount}`);

    if (!ready.dryRun) {
      for (let index = 0; index < plan.actions.length; index++) {
        const action = plan.actions[index];
        const item = itemById.get(action.id);
        if (!item) throw new Error(`目录条目消失: ${action.id}`);
        setStatus(`${collection.name}：处理 ${index + 1}/${plan.actions.length} ${item.title || item.id}`);
        const payload = await buildPayload(item, ready.comments);
        const resultPromise = waitForMessage(port, (message): message is Extract<NativeToExtensionMessage, { type: 'sync.content-result' }> =>
          message.type === 'sync.content-result'
          && message.jobId === jobId
          && message.collectionId === collection.id
          && message.id === item.id);
        send(port, { type: 'sync.content', jobId, collectionId: collection.id, payload });
        await Promise.race([resultPromise, disconnected]);
      }
    }
  }

  const completePromise = waitForMessage(port, (message): message is Extract<NativeToExtensionMessage, { type: 'sync.completed' }> =>
    message.type === 'sync.completed' && message.jobId === jobId);
  send(port, { type: 'sync.complete', jobId });
  await Promise.race([completePromise, disconnected]);
  setStatus(ready.dryRun ? '只读预检完成，可以关闭此标签页。' : '同步完成，可以关闭此标签页。');
  finished = true;
  port.disconnect();
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`同步失败：${message}`, true);
  if (activePort && jobId && /^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
    try {
      activePort.postMessage({ type: 'sync.failed', jobId, message });
    } catch { /* 原连接已断开时无法再报告 */ }
  }
});
