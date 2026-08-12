import { describe, expect, it, vi } from 'vitest';
import type { ContentItem, VoteActivityPage } from '../types/zhihu';
import { fetchVoteCatalog } from './votes';

function item(id: string, activityId: string): ContentItem {
  return {
    id, activity_id: activityId, type: 'answer', url: `https://example.com/${id}`,
    title: id, author: 'author', html: '', isTruncated: false,
    isPaidContent: false, commentCount: 0, created_time: 1, updated_time: 1,
  };
}

function page(ids: string[], nextUrl: string | null, isEnd = false): VoteActivityPage {
  return {
    activityIds: ids,
    items: ids.map((id) => item(`answer-${id}`, id)),
    nextUrl,
    isEnd,
    remoteSeen: ids.length,
    skippedUnsupported: 0,
    skippedPaid: 0,
  };
}

describe('fetchVoteCatalog', () => {
  it('checks newest votes before continuing an existing historical backfill', async () => {
    const fetchPage = vi.fn(async (url: string) => {
      if (url.includes('page_num=1')) return page(['new-2', 'new-1', 'known'], 'latest-2');
      if (url === 'history-421') return page(['old-421'], 'history-422');
      throw new Error(`unexpected ${url}`);
    });

    const result = await fetchVoteCatalog({
      token: 'me',
      votes: {
        startUrl: 'history-421',
        knownActivityIds: ['known'],
        backfillInProgress: true,
      },
      maxPages: 2,
      fetchPage,
    });

    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      'https://www.zhihu.com/api/v3/moments/me/activities?page_num=1',
      'history-421',
    ]);
    expect(result.items.map((entry) => entry.id)).toEqual([
      'answer-new-2', 'answer-new-1', 'answer-old-421',
    ]);
    expect(result.checkpointActivityIds).toEqual(['new-2', 'new-1', 'known']);
    expect(result.nextCursor).toBe('history-422');
    expect(result.historyComplete).toBe(false);
  });

  it('does not advance the historical cursor when newest scan uses the page budget', async () => {
    const fetchPage = vi.fn(async (url: string) => {
      if (url.includes('page_num=1')) return page(['new-2'], 'latest-2');
      if (url === 'latest-2') return page(['new-1'], 'latest-3');
      throw new Error(`unexpected ${url}`);
    });

    const result = await fetchVoteCatalog({
      token: 'me',
      votes: {
        startUrl: 'history-421',
        knownActivityIds: ['known'],
        backfillInProgress: true,
      },
      maxPages: 2,
      fetchPage,
    });

    expect(result.nextCursor).toBe('history-421');
    expect(result.historyComplete).toBe(false);
    expect(result.items).toHaveLength(2);
  });

  it('uses the newest scan as initial historical backfill when no cursor exists', async () => {
    const fetchPage = vi.fn(async () => page(['a', 'b'], null, true));
    const result = await fetchVoteCatalog({
      token: 'me', votes: undefined, maxPages: 10, fetchPage,
    });
    expect(result.historyComplete).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.checkpointActivityIds).toEqual(['a', 'b']);
  });
});
