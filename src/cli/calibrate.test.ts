// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { calibrateVault } from './calibrate';

const tempRoots: string[] = [];

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zhihu-sync-'));
  tempRoots.push(root);
  const articles = join(root, '测试收藏', 'articles');
  await mkdir(articles, { recursive: true });
  await writeFile(join(root, 'export-progress-123.json'), JSON.stringify({
    collectionId: '123',
    collectionName: '测试收藏',
    articles: { exportedIds: ['a1', 'a2'], totalExported: 2 },
    comments: { exportedArticles: ['a1'], totalExported: 1 },
  }));
  await writeFile(join(articles, '文章1.md'), `---\nid: "a1"\ntitle: "文章1"\nupdated: "2026-01-01 00:00"\n---\n正文`);
  await writeFile(join(articles, '文章3.md'), `---\nid: "a3"\ntitle: "文章3"\n---\n正文`);
  await writeFile(join(articles, '文章1-评论.md'), '# 评论');
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('calibrateVault', () => {
  it('只读识别缺失、未跟踪文件和评论计数', async () => {
    const root = await createFixture();
    const before = await readFile(join(root, 'export-progress-123.json'), 'utf8');
    const report = await calibrateVault(root);
    const item = report.collections[0];

    expect(report.readOnly).toBe(true);
    expect(item.missingOnDisk).toEqual(['a2']);
    expect(item.untrackedOnDisk).toEqual(['a3']);
    expect(item.actualArticleCount).toBe(2);
    expect(item.actualCommentCount).toBe(1);
    expect(item.hasDrift).toBe(true);
    expect(await readFile(join(root, 'export-progress-123.json'), 'utf8')).toBe(before);
  });

  it('可按收藏夹 ID 过滤', async () => {
    const root = await createFixture();
    const report = await calibrateVault(root, ['123']);
    expect(report.collections).toHaveLength(1);
    expect(report.collections[0].collectionId).toBe('123');
  });

  it('将进度账本重复 ID 与文件缺失分开报告', async () => {
    const root = await createFixture();
    const progressPath = join(root, 'export-progress-123.json');
    await writeFile(progressPath, JSON.stringify({
      collectionId: '123',
      collectionName: '测试收藏',
      articles: { exportedIds: ['a1', 'a1', 'a3'], totalExported: 3 },
      comments: { exportedArticles: ['a1'], totalExported: 1 },
    }));

    const item = (await calibrateVault(root)).collections[0];
    expect(item.progressEntryCount).toBe(3);
    expect(item.progressUniqueIdCount).toBe(2);
    expect(item.duplicateProgressIds).toEqual(['a1']);
    expect(item.duplicateProgressEntryCount).toBe(1);
    expect(item.missingOnDisk).toEqual([]);
  });
});
