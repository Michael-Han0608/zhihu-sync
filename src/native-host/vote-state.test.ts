import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readVoteState, voteStatePath, writeVoteState } from './vote-state';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('vote sync state', () => {
  it('首次使用返回安全的空状态', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zhihu-votes-'));
    roots.push(root);
    const state = await readVoteState(root);
    expect(state.newestActivityIds).toEqual([]);
    expect(state.backfillCursor).toBeNull();
    expect(state.historyComplete).toBe(false);
  });

  it('原子保存断点和最新活动 ID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zhihu-votes-'));
    roots.push(root);
    await writeVoteState(root, {
      schemaVersion: 1,
      newestActivityIds: ['activity-1'],
      backfillCursor: 'https://www.zhihu.com/api/v3/moments/me/activities?after_id=1',
      historyComplete: false,
      updatedAt: '',
    });
    const state = await readVoteState(root);
    expect(state.newestActivityIds).toEqual(['activity-1']);
    expect(state.backfillCursor).toContain('after_id=1');
    expect(JSON.parse(await readFile(voteStatePath(root), 'utf8'))).toEqual(state);
  });
});
