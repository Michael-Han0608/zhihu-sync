import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repairVoteMetadata } from './repair-vote-metadata';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('repair vote metadata', () => {
  it('仅移除错误收藏时间，不猜造来源 URL', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vote-repair-'));
    roots.push(root);
    const dir = join(root, '赞同的回答', 'articles');
    await mkdir(dir, { recursive: true });
    const path = join(dir, '回答.md');
    await writeFile(path, [
      '---',
      'id: "123"',
      'source: "https://api.zhihu.com/answers/123"',
      'collected: "2026-01-01 00:00"',
      'voted: "2026-01-02 00:00"',
      '---',
      '正文',
    ].join('\n'));
    const report = await repairVoteMetadata(root);
    const result = await readFile(path, 'utf8');
    expect(report.changed).toBe(1);
    expect(result).not.toContain('collected:');
    expect(result).toContain('voted: "2026-01-02 00:00"');
    expect(result).toContain('source: "https://api.zhihu.com/answers/123"');
  });
});
