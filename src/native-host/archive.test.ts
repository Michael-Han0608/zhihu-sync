import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SyncConfig } from '../cli/types';
import type { CatalogItem } from '../shared/native-messages';
import {
  createArchiveContext,
  planCatalog,
  sanitizeCollectionDirectoryName,
  sanitizeCollectionOutputDir,
  sanitizeWindowsDirectorySegment,
  writeContent,
} from './archive';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function item(id: string, updated: number): CatalogItem {
  return {
    id,
    type: 'answer',
    url: `https://www.zhihu.com/question/1/answer/${id}`,
    title: `问题 ${id}`,
    author: '作者',
    isTruncated: false,
    isPaidContent: false,
    commentCount: 0,
    created_time: updated,
    updated_time: updated,
  };
}

async function fixture(): Promise<{ root: string; config: SyncConfig; articles: string }> {
  const root = await mkdtemp(join(tmpdir(), 'zhihu-sync-archive-'));
  roots.push(root);
  const articles = join(root, '收藏夹', 'articles');
  await mkdir(articles, { recursive: true });
  await writeFile(join(articles, '旧回答.md'), [
    '---',
    'id: "a1"',
    'title: "旧回答"',
    'updated: "2026-01-01 00:00"',
    '---',
    '旧正文',
  ].join('\n'));
  await writeFile(join(root, 'export-progress-123.json'), JSON.stringify({
    collectionId: '123',
    collectionName: '收藏夹',
    articles: { exportedIds: ['a1'], totalExported: 1 },
    comments: { exportedArticles: [], totalExported: 0 },
  }));
  return {
    root,
    articles,
    config: {
      schemaVersion: 1,
      vaultRoot: root,
      collections: [{ id: '123', name: '收藏夹' }],
    },
  };
}

describe('append-only archive', () => {
  it('sanitizes Windows-invalid collection directory segments', () => {
    expect(sanitizeWindowsDirectorySegment('收藏: ?*')).toBe('收藏_ __');
    expect(sanitizeWindowsDirectorySegment('尾部名称. ')).toBe('尾部名称');
    expect(sanitizeWindowsDirectorySegment('CON.txt')).toBe('_CON.txt');
    expect(sanitizeWindowsDirectorySegment('CON .txt')).toBe('_CON .txt');
    expect(sanitizeWindowsDirectorySegment('LPT1')).toBe('_LPT1');
    expect(sanitizeWindowsDirectorySegment('LPT1. ')).toBe('_LPT1');
    expect(sanitizeWindowsDirectorySegment('...')).toBe('未命名收藏夹');
  });

  it('sanitizes each Windows outputDir segment without flattening nesting', () => {
    expect(sanitizeCollectionOutputDir('父目录/子:目录. ')).toBe('父目录\\子_目录');
  });

  it('keeps collection names unchanged outside Windows', () => {
    if (process.platform === 'win32') return;
    expect(sanitizeCollectionDirectoryName('收藏: ?*')).toBe('收藏: ?*');
    expect(sanitizeCollectionOutputDir('父目录/子:目录. ')).toBe('父目录/子:目录. ');
  });

  it.skipIf(process.platform !== 'win32')('creates a safe Windows collection directory', async () => {
    const data = await fixture();
    const context = await createArchiveContext(data.config, {
      id: '123',
      name: '收藏夹: CON. ',
    });
    expect(context.collectionDir).toBe(join(data.root, '收藏夹_ CON'));
    await mkdir(context.articlesDir, { recursive: true });
  });

  it('按分钟比较 updated_time，并保留本地独有内容', async () => {
    const data = await fixture();
    const context = await createArchiveContext(data.config, data.config.collections[0]);
    const sameMinute = Math.floor(new Date('2026-01-01T00:00:40').getTime() / 1000);
    const result = planCatalog(context, [item('a1', sameMinute), item('a2', sameMinute)], {
      remoteTotal: 2,
      remoteSeen: 2,
      skippedUnsupported: 0,
      skippedPaid: 0,
    });
    expect(result.actions).toEqual([{ id: 'a2', action: 'new' }]);
    expect(result.unchangedCount).toBe(1);
    expect(result.localOnlyCount).toBe(0);
  });

  it('赞同增量窗口不把窗口外本地回答统计为远端删除', async () => {
    const data = await fixture();
    const context = await createArchiveContext(data.config, {
      id: 'votes',
      name: '赞同的回答',
      outputDir: '收藏夹',
    });
    const remote = item('a2', Math.floor(new Date('2026-02-02T03:04:00').getTime() / 1000));
    const result = planCatalog(context, [remote], {
      remoteTotal: 1,
      remoteSeen: 7,
      skippedUnsupported: 6,
      skippedPaid: 0,
      completeSnapshot: false,
    });
    expect(result.actions).toEqual([{ id: 'a2', action: 'new' }]);
    expect(result.localOnlyCount).toBe(0);
  });

  it('rejects Windows-style traversal in collection outputDir', async () => {
    const data = await fixture();
    await expect(createArchiveContext(data.config, {
      id: '123',
      name: 'Windows path safety',
      outputDir: '..\\outside',
    })).rejects.toThrow('outputDir');
  });

  it('更新正文前保存旧版本，评论覆盖且进度不重复', async () => {
    const data = await fixture();
    const context = await createArchiveContext(data.config, data.config.collections[0]);
    const remote = item('a1', Math.floor(new Date('2026-02-02T03:04:00').getTime() / 1000));
    const result = planCatalog(context, [remote], {
      remoteTotal: 1,
      remoteSeen: 1,
      skippedUnsupported: 0,
      skippedPaid: 0,
    });
    expect(result.actions).toEqual([{ id: 'a1', action: 'update' }]);
    const written = await writeContent(context, {
      item: remote,
      markdown: '---\nid: "a1"\nupdated: "2026-02-02 03:04"\n---\n新正文',
      images: [],
      commentsMarkdown: '# 新评论',
      commentImages: [],
    });
    expect(await readFile(written.path, 'utf8')).toContain('新正文');
    expect(await readFile(join(data.articles, 'versions', 'a1', '2026-01-01_00-00.md'), 'utf8')).toContain('旧正文');
    expect(await readFile(join(data.articles, '旧回答-评论.md'), 'utf8')).toBe('# 新评论');
    const progress = JSON.parse(await readFile(join(data.root, 'export-progress-123.json'), 'utf8'));
    expect(progress.articles.exportedIds).toEqual(['a1']);
    expect(progress.comments.exportedArticles).toEqual(['a1']);
  });
});
