import type { SyncReadyMessage } from '../shared/native-messages';
import type { ContentItem, VoteActivityPage } from '../types/zhihu';

export interface VoteCatalog {
  items: ContentItem[];
  remoteTotal: number;
  remoteSeen: number;
  skippedUnsupported: number;
  skippedPaid: number;
  nextCursor: string | null;
  historyComplete: boolean;
  checkpointActivityIds: string[];
}

interface FetchVoteCatalogOptions {
  token: string;
  votes: SyncReadyMessage['votes'];
  maxPages: number;
  fetchPage: (url: string) => Promise<VoteActivityPage>;
  onProgress?: (message: string) => void;
}

function addPageItems(
  byId: Map<string, ContentItem>,
  page: VoteActivityPage,
  stopAtActivityIndex = -1,
): void {
  for (const item of page.items) {
    const activityIndex = item.activity_id ? page.activityIds.indexOf(item.activity_id) : -1;
    if (stopAtActivityIndex >= 0 && activityIndex >= stopAtActivityIndex) continue;
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
}

/**
 * A vote sync always checks the newest activity first. If an older-history cursor
 * exists, the remaining page budget then continues that backfill. This prevents
 * a long-running historical import from hiding newly upvoted answers.
 */
export async function fetchVoteCatalog(options: FetchVoteCatalogOptions): Promise<VoteCatalog> {
  const latestUrl = `https://www.zhihu.com/api/v3/moments/${encodeURIComponent(options.token)}/activities?page_num=1`;
  const backfillCursor = options.votes?.backfillInProgress ? options.votes.startUrl : undefined;
  const known = new Set(options.votes?.knownActivityIds || []);
  const byId = new Map<string, ContentItem>();
  const checkpointActivityIds: string[] = [];
  let remoteSeen = 0;
  let skippedUnsupported = 0;
  let skippedPaid = 0;
  let pages = 0;

  const recordPage = (page: VoteActivityPage): void => {
    pages++;
    remoteSeen += page.remoteSeen;
    skippedUnsupported += page.skippedUnsupported;
    skippedPaid += page.skippedPaid;
  };
  const progress = (phase: '最新' | '历史'): void => {
    options.onProgress?.(`读取赞同动态（${phase}）：第 ${pages}/${options.maxPages} 页，发现 ${byId.size} 个回答`);
  };

  // With no historical cursor, the newest scan is also the initial backfill.
  if (!backfillCursor) {
    let nextUrl: string | null = latestUrl;
    while (nextUrl && pages < options.maxPages) {
      const page = await options.fetchPage(nextUrl);
      recordPage(page);
      if (checkpointActivityIds.length < 20) {
        checkpointActivityIds.push(...page.activityIds.slice(0, 20 - checkpointActivityIds.length));
      }
      const firstKnownIndex = page.activityIds.findIndex((id) => known.has(id));
      addPageItems(byId, page, firstKnownIndex);
      progress('最新');
      if (firstKnownIndex >= 0 || page.isEnd) {
        return {
          items: [...byId.values()], remoteTotal: byId.size, remoteSeen,
          skippedUnsupported, skippedPaid, nextCursor: null, historyComplete: true,
          checkpointActivityIds,
        };
      }
      nextUrl = page.nextUrl;
    }
    return {
      items: [...byId.values()], remoteTotal: byId.size, remoteSeen,
      skippedUnsupported, skippedPaid, nextCursor: nextUrl, historyComplete: false,
      checkpointActivityIds,
    };
  }

  // Phase 1: scan from page one until the previous newest checkpoint is found.
  let latestNext: string | null = latestUrl;
  let reachedKnown = known.size === 0;
  while (latestNext && pages < options.maxPages && !reachedKnown) {
    const page = await options.fetchPage(latestNext);
    recordPage(page);
    if (checkpointActivityIds.length < 20) {
      checkpointActivityIds.push(...page.activityIds.slice(0, 20 - checkpointActivityIds.length));
    }
    const firstKnownIndex = page.activityIds.findIndex((id) => known.has(id));
    addPageItems(byId, page, firstKnownIndex);
    progress('最新');
    reachedKnown = firstKnownIndex >= 0 || page.isEnd;
    latestNext = page.nextUrl;
  }

  // If the checkpoint was not reached within the page budget, keep the old
  // history cursor untouched. The next run safely retries the newest scan.
  if (!reachedKnown || pages >= options.maxPages) {
    return {
      items: [...byId.values()], remoteTotal: byId.size, remoteSeen,
      skippedUnsupported, skippedPaid, nextCursor: backfillCursor, historyComplete: false,
      checkpointActivityIds,
    };
  }

  // Phase 2: spend the remaining budget on the older-history cursor.
  let historyNext: string | null = backfillCursor;
  while (historyNext && pages < options.maxPages) {
    const page = await options.fetchPage(historyNext);
    recordPage(page);
    addPageItems(byId, page);
    progress('历史');
    historyNext = page.isEnd ? null : page.nextUrl;
  }
  return {
    items: [...byId.values()], remoteTotal: byId.size, remoteSeen,
    skippedUnsupported, skippedPaid, nextCursor: historyNext,
    historyComplete: historyNext === null,
    checkpointActivityIds,
  };
}
