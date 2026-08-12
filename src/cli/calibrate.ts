import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { readArticleFrontmatter } from './frontmatter';
import type {
  CalibrationReport,
  CollectionCalibration,
  LegacyProgress,
  LocalArticleRecord,
} from './types';

function validateLegacyProgress(value: unknown, path: string): LegacyProgress {
  if (!value || typeof value !== 'object') {
    throw new Error(`进度文件不是 JSON 对象: ${path}`);
  }
  const item = value as LegacyProgress;
  if (!/^\d+$/.test(String(item.collectionId || ''))
      || typeof item.collectionName !== 'string'
      || !Array.isArray(item.articles?.exportedIds)
      || !Number.isInteger(item.articles?.totalExported)
      || !Array.isArray(item.comments?.exportedArticles)
      || !Number.isInteger(item.comments?.totalExported)) {
    throw new Error(`进度文件结构无效: ${path}`);
  }
  return item;
}

async function readProgress(path: string): Promise<LegacyProgress> {
  const raw = await readFile(path, 'utf8');
  try {
    return validateLegacyProgress(JSON.parse(raw), path);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`进度文件不是有效 JSON: ${path}`);
    }
    throw error;
  }
}

function setDifference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function findDuplicateValues(values: string[]): { ids: string[]; extraEntryCount: number } {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  let extraEntryCount = 0;
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      extraEntryCount++;
    } else {
      seen.add(value);
    }
  }
  return { ids: [...duplicates].sort(), extraEntryCount };
}

async function scanArticles(articlesDir: string): Promise<{
  articles: LocalArticleRecord[];
  commentCount: number;
  invalidMarkdown: string[];
}> {
  const entries = await readdir(articlesDir, { withFileTypes: true });
  const articlePaths: string[] = [];
  let commentCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
    if (entry.name.endsWith('-评论.md')) {
      commentCount++;
      continue;
    }
    articlePaths.push(join(articlesDir, entry.name));
  }

  const parsed = await Promise.all(articlePaths.map(async (path) => ({
    path,
    record: await readArticleFrontmatter(path),
  })));

  return {
    articles: parsed.flatMap(({ record }) => record ? [record] : []),
    commentCount,
    invalidMarkdown: parsed.filter(({ record }) => !record).map(({ path }) => path).sort(),
  };
}

async function calibrateCollection(
  vaultRoot: string,
  progressPath: string,
): Promise<CollectionCalibration> {
  const errors: string[] = [];
  let progress: LegacyProgress;

  try {
    progress = await readProgress(progressPath);
  } catch (error) {
    return {
      collectionId: basename(progressPath).replace(/^export-progress-|\.json$/g, ''),
      collectionName: '未知收藏夹',
      progressPath,
      articlesDir: '',
      progressTotal: 0,
      progressEntryCount: 0,
      progressUniqueIdCount: 0,
      actualArticleCount: 0,
      progressCommentTotal: 0,
      actualCommentCount: 0,
      missingOnDisk: [],
      untrackedOnDisk: [],
      duplicateProgressIds: [],
      duplicateProgressEntryCount: 0,
      duplicateIds: [],
      invalidMarkdown: [],
      errors: [(error as Error).message],
      hasDrift: true,
    };
  }

  const collectionDir = join(vaultRoot, progress.collectionName);
  const articlesDir = join(collectionDir, 'articles');
  let scan: Awaited<ReturnType<typeof scanArticles>>;
  try {
    scan = await scanArticles(articlesDir);
  } catch (error) {
    errors.push(`无法扫描 articles 目录: ${(error as Error).message}`);
    scan = { articles: [], commentCount: 0, invalidMarkdown: [] };
  }

  const diskIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const article of scan.articles) {
    if (diskIds.has(article.id)) duplicateIds.add(article.id);
    diskIds.add(article.id);
  }

  const progressEntries = progress.articles.exportedIds.map(String);
  const progressIds = new Set(progressEntries);
  const duplicateProgress = findDuplicateValues(progressEntries);
  const missingOnDisk = setDifference(progressIds, diskIds);
  const untrackedOnDisk = setDifference(diskIds, progressIds);
  const hasDrift = errors.length > 0
    || progress.articles.totalExported !== progressIds.size
    || progressIds.size !== diskIds.size
    || progress.comments.totalExported !== scan.commentCount
    || missingOnDisk.length > 0
    || untrackedOnDisk.length > 0
    || duplicateProgress.extraEntryCount > 0
    || duplicateIds.size > 0
    || scan.invalidMarkdown.length > 0;

  return {
    collectionId: String(progress.collectionId),
    collectionName: progress.collectionName,
    progressPath,
    articlesDir,
    progressTotal: progress.articles.totalExported,
    progressEntryCount: progressEntries.length,
    progressUniqueIdCount: progressIds.size,
    actualArticleCount: diskIds.size,
    progressCommentTotal: progress.comments.totalExported,
    actualCommentCount: scan.commentCount,
    missingOnDisk,
    untrackedOnDisk,
    duplicateProgressIds: duplicateProgress.ids,
    duplicateProgressEntryCount: duplicateProgress.extraEntryCount,
    duplicateIds: [...duplicateIds].sort(),
    invalidMarkdown: scan.invalidMarkdown,
    errors,
    hasDrift,
  };
}

export async function calibrateVault(
  inputVaultRoot: string,
  collectionIds: string[] = [],
): Promise<CalibrationReport> {
  const vaultRoot = resolve(inputVaultRoot);
  const entries = await readdir(vaultRoot, { withFileTypes: true });
  const requested = new Set(collectionIds);
  const progressPaths = entries
    .filter((entry) => entry.isFile() && /^export-progress-\d+\.json$/.test(entry.name))
    .filter((entry) => requested.size === 0
      || requested.has(entry.name.match(/\d+/)?.[0] || ''))
    .map((entry) => join(vaultRoot, entry.name))
    .sort();

  if (progressPaths.length === 0) {
    throw new Error(`未在目录中找到 export-progress-{id}.json: ${vaultRoot}`);
  }

  const collections = await Promise.all(
    progressPaths.map((path) => calibrateCollection(vaultRoot, path)),
  );

  return {
    vaultRoot,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    collections,
    hasDrift: collections.some((item) => item.hasDrift),
  };
}

function indentIds(ids: string[], limit = 20): string[] {
  const lines = ids.slice(0, limit).map((id) => `      - ${id}`);
  if (ids.length > limit) lines.push(`      - …其余 ${ids.length - limit} 个`);
  return lines;
}

export function formatCalibrationReport(report: CalibrationReport): string {
  const lines = [
    `知乎归档校准（只读）: ${report.vaultRoot}`,
    `生成时间: ${report.generatedAt}`,
    '',
  ];

  for (const item of report.collections) {
    lines.push(`${item.collectionName} (${item.collectionId})`);
    lines.push(`  正文: 进度 total=${item.progressTotal}, 数组条目=${item.progressEntryCount}, 唯一 ID=${item.progressUniqueIdCount}, 实际=${item.actualArticleCount}`);
    lines.push(`  评论: 进度=${item.progressCommentTotal}, 实际=${item.actualCommentCount}`);
    lines.push(`  状态: ${item.hasDrift ? '存在偏差' : '一致'}`);
    if (item.missingOnDisk.length) {
      lines.push(`  进度有记录但文件缺失 (${item.missingOnDisk.length}):`);
      lines.push(...indentIds(item.missingOnDisk));
    }
    if (item.untrackedOnDisk.length) {
      lines.push(`  文件存在但进度未记录 (${item.untrackedOnDisk.length}):`);
      lines.push(...indentIds(item.untrackedOnDisk));
    }
    if (item.duplicateProgressEntryCount) {
      lines.push(`  进度账本重复记录 ${item.duplicateProgressEntryCount} 次，涉及 ${item.duplicateProgressIds.length} 个 ID:`);
      lines.push(...indentIds(item.duplicateProgressIds));
    }
    if (item.duplicateIds.length) {
      lines.push(`  重复 ID (${item.duplicateIds.length}):`);
      lines.push(...indentIds(item.duplicateIds));
    }
    if (item.invalidMarkdown.length) {
      lines.push(`  无法识别 Front Matter 的正文 (${item.invalidMarkdown.length})`);
    }
    for (const error of item.errors) lines.push(`  错误: ${error}`);
    lines.push('');
  }

  lines.push(report.hasDrift
    ? '结论: 发现偏差；本次未修改任何文件。'
    : '结论: 本地文件与旧进度账本一致；本次未修改任何文件。');
  return lines.join('\n');
}
