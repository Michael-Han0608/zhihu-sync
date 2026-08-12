import { constants } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { readArticleFrontmatter } from '../cli/frontmatter';
import type { CollectionConfig, LegacyProgress, LocalArticleRecord, SyncConfig } from '../cli/types';
import type {
  CatalogItem,
  SyncAction,
  SyncContentPayload,
  SyncPlanMessage,
} from '../shared/native-messages';

export interface CollectionArchiveContext {
  config: SyncConfig;
  collection: CollectionConfig;
  collectionDir: string;
  articlesDir: string;
  progressPath: string;
  localById: Map<string, LocalArticleRecord>;
  actionById: Map<string, SyncAction>;
}

const WINDOWS_INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL', 'CLOCK$',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

function isTraversalSegment(segment: string): boolean {
  const trimmed = segment.replace(/\s+$/g, '');
  return trimmed === '..';
}

export function sanitizeWindowsDirectorySegment(segment: string): string {
  const sanitized = segment
    .replace(WINDOWS_INVALID_NAME_CHARS, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/g, '');
  if (!sanitized || sanitized === '.' || sanitized === '..') return '未命名收藏夹';

  const deviceName = sanitized.split('.')[0].replace(/[. ]+$/g, '').toUpperCase();
  return WINDOWS_RESERVED_DEVICE_NAMES.has(deviceName)
    ? `_${sanitized}`
    : sanitized;
}

/**
 * A collection name is a single directory name, while an explicit outputDir
 * may intentionally contain relative nested directories.
 */
export function sanitizeCollectionDirectoryName(name: string): string {
  return process.platform === 'win32' ? sanitizeWindowsDirectorySegment(name) : name;
}

export function sanitizeCollectionOutputDir(outputDir: string): string {
  if (process.platform !== 'win32') return outputDir;
  return outputDir
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== '.')
    .map(sanitizeWindowsDirectorySegment)
    .join('\\');
}

function safeCollectionDir(config: SyncConfig, collection: CollectionConfig): string {
  const rawCandidate = collection.outputDir || collection.name;
  if (
    isAbsolute(rawCandidate)
    || (collection.outputDir && rawCandidate.split(/[\\/]/).some(isTraversalSegment))
  ) {
    throw new Error(`收藏夹 outputDir 不安全: ${rawCandidate}`);
  }
  const candidate = collection.outputDir
    ? sanitizeCollectionOutputDir(rawCandidate)
    : sanitizeCollectionDirectoryName(rawCandidate);
  const output = join(config.vaultRoot, candidate);
  const rel = relative(config.vaultRoot, output);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`收藏夹路径越界: ${rawCandidate}`);
  return output;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/<[^>]*>/g, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|#^\[\]()（）]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || '无标题';
}

function buildItemBaseName(item: CatalogItem): string {
  if (item.type === 'article') return sanitizeFilename(item.title || `${item.author}的文章`);
  if (item.type === 'answer') {
    return sanitizeFilename(item.title
      ? `${item.title}-${item.author}的回答`
      : `${item.author}的回答`);
  }
  return sanitizeFilename(`${item.title || item.id}-${item.author}`);
}

function parseLocalUpdated(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function isRemoteNewerOrDifferent(remote: number, local: string | undefined): boolean {
  if (!remote) return false;
  const localSeconds = parseLocalUpdated(local);
  if (localSeconds === null) return true;
  return Math.floor(remote / 60) !== Math.floor(localSeconds / 60);
}

async function scanLocalArticles(articlesDir: string): Promise<Map<string, LocalArticleRecord>> {
  const result = new Map<string, LocalArticleRecord>();
  let entries;
  try {
    entries = await readdir(articlesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name.endsWith('-评论.md')) continue;
    const path = join(articlesDir, entry.name);
    const record = await readArticleFrontmatter(path);
    if (record && !result.has(record.id)) result.set(record.id, record);
  }
  return result;
}

export async function createArchiveContext(
  config: SyncConfig,
  collection: CollectionConfig,
): Promise<CollectionArchiveContext> {
  const collectionDir = safeCollectionDir(config, collection);
  const articlesDir = join(collectionDir, 'articles');
  return {
    config,
    collection,
    collectionDir,
    articlesDir,
    progressPath: collection.id === 'votes'
      ? join(collectionDir, 'vote-progress.json')
      : join(config.vaultRoot, `export-progress-${collection.id}.json`),
    localById: await scanLocalArticles(articlesDir),
    actionById: new Map(),
  };
}

export function planCatalog(
  context: CollectionArchiveContext,
  items: CatalogItem[],
  extras: {
    remoteTotal: number;
    remoteSeen: number;
    skippedUnsupported: number;
    skippedPaid: number;
    completeSnapshot?: boolean;
  },
): SyncPlanMessage['summary'] & { actions: Array<{ id: string; action: SyncAction }> } {
  const unique = new Map(items.map((item) => [item.id, item]));
  const actions: Array<{ id: string; action: SyncAction }> = [];
  let unchangedCount = 0;
  for (const item of unique.values()) {
    const local = context.localById.get(item.id);
    if (!local) {
      actions.push({ id: item.id, action: 'new' });
    } else if (isRemoteNewerOrDifferent(item.updated_time, local.updated)) {
      actions.push({ id: item.id, action: 'update' });
    } else {
      unchangedCount++;
    }
  }
  context.actionById = new Map(actions.map((item) => [item.id, item.action]));
  const remoteIds = new Set(unique.keys());
  const localOnlyCount = extras.completeSnapshot === false
    ? 0
    : [...context.localById.keys()].filter((id) => !remoteIds.has(id)).length;
  return {
    actions,
    remoteTotal: extras.remoteTotal,
    remoteSeen: extras.remoteSeen,
    supported: unique.size,
    newCount: actions.filter((item) => item.action === 'new').length,
    updateCount: actions.filter((item) => item.action === 'update').length,
    unchangedCount,
    localOnlyCount,
    skippedUnsupported: extras.skippedUnsupported,
    skippedPaid: extras.skippedPaid,
  };
}

async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

function safeRelativeFile(root: string, relativePath: string): string {
  if (isAbsolute(relativePath) || relativePath.includes('\0')) throw new Error('无效相对路径');
  const output = join(root, normalize(relativePath));
  const rel = relative(root, output);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`路径越界: ${relativePath}`);
  return output;
}

async function downloadImages(
  articlesDir: string,
  markdown: string,
  images: Array<{ url: string; relativePath: string }>,
): Promise<string> {
  let output = markdown;
  for (const image of images) {
    if (!/^https:\/\//i.test(image.url) || !image.relativePath.startsWith('images/')) continue;
    try {
      const response = await fetch(image.url, { headers: { Accept: 'image/*' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 50 * 1024 * 1024) throw new Error('图片超过 50MB');
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > 50 * 1024 * 1024) throw new Error('图片超过 50MB');
      await atomicWrite(safeRelativeFile(articlesDir, image.relativePath), buffer);
    } catch {
      output = output.split(`](${image.relativePath})`).join(`](${image.url})`);
    }
  }
  return output;
}

function versionLabel(record: LocalArticleRecord): string {
  if (record.updated) return sanitizeFilename(record.updated.replace(/:/g, '-').replace(' ', '_'));
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function archivePreviousVersion(context: CollectionArchiveContext, record: LocalArticleRecord): Promise<void> {
  const versionPath = join(context.articlesDir, 'versions', record.id, `${versionLabel(record)}.md`);
  await mkdir(dirname(versionPath), { recursive: true });
  try {
    await copyFile(record.path, versionPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

async function chooseNewArticlePath(context: CollectionArchiveContext, item: CatalogItem): Promise<string> {
  const base = buildItemBaseName(item);
  let path = join(context.articlesDir, `${base}.md`);
  try {
    await stat(path);
    path = join(context.articlesDir, `${base}_${item.id}.md`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return path;
}

async function readProgress(context: CollectionArchiveContext): Promise<LegacyProgress> {
  try {
    return JSON.parse(await readFile(context.progressPath, 'utf8')) as LegacyProgress;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      collectionId: context.collection.id,
      collectionName: context.collection.name,
      articles: { exportedIds: [], totalExported: 0 },
      comments: { exportedArticles: [], totalExported: 0 },
    };
  }
}

async function updateProgress(context: CollectionArchiveContext, itemId: string, commentsWritten: boolean): Promise<void> {
  const progress = await readProgress(context);
  if (!progress.articles.exportedIds.map(String).includes(itemId)) {
    progress.articles.exportedIds.push(itemId);
    progress.articles.totalExported++;
  }
  if (commentsWritten && !progress.comments.exportedArticles.map(String).includes(itemId)) {
    progress.comments.exportedArticles.push(itemId);
    progress.comments.totalExported++;
  }
  await atomicWrite(context.progressPath, `${JSON.stringify(progress, null, 2)}\n`);
}

export async function writeContent(
  context: CollectionArchiveContext,
  payload: SyncContentPayload,
): Promise<{ action: SyncAction; path: string; commentsWritten: boolean }> {
  const action = context.actionById.get(payload.item.id);
  if (!action) throw new Error(`条目不在写入计划中: ${payload.item.id}`);
  if (!['article', 'answer'].includes(payload.item.type)) throw new Error(`不支持的类型: ${payload.item.type}`);

  await mkdir(context.articlesDir, { recursive: true });
  const local = context.localById.get(payload.item.id);
  const outputPath = action === 'update' && local
    ? local.path
    : await chooseNewArticlePath(context, payload.item);
  if (action === 'update' && local) await archivePreviousVersion(context, local);

  const markdown = await downloadImages(context.articlesDir, payload.markdown, payload.images);
  await atomicWrite(outputPath, markdown);

  let commentsWritten = false;
  if (payload.commentsMarkdown !== undefined) {
    const commentMarkdown = await downloadImages(
      context.articlesDir,
      payload.commentsMarkdown,
      payload.commentImages || [],
    );
    const commentPath = join(dirname(outputPath), `${basename(outputPath, '.md')}-评论.md`);
    await atomicWrite(commentPath, commentMarkdown);
    commentsWritten = true;
  }

  await updateProgress(context, payload.item.id, commentsWritten);
  context.localById.set(payload.item.id, {
    id: payload.item.id,
    path: outputPath,
    title: payload.item.title,
    source: payload.item.url,
    updated: payload.item.updated_time ? new Date(payload.item.updated_time * 1000).toISOString() : undefined,
    type: `zhihu-${payload.item.type}`,
  });
  context.actionById.delete(payload.item.id);
  return { action, path: outputPath, commentsWritten };
}
