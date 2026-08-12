import type { ContentItem } from '@/types/zhihu';

export const NATIVE_HOST_NAME = 'com.yonghan.zhihu_sync';
export const NATIVE_PROTOCOL_VERSION = 1;

export type SyncAction = 'new' | 'update';
export type SyncMode = 'collections' | 'votes';

export interface SyncCollectionSpec {
  id: string;
  name: string;
  apiUrl: string;
}

export type CatalogItem = Omit<ContentItem, 'html'>;

export interface SyncHelloMessage {
  type: 'sync.hello';
  protocolVersion: 1;
  jobId: string;
}

export interface SyncCatalogMessage {
  type: 'sync.catalog';
  jobId: string;
  collectionId: string;
  items: CatalogItem[];
  remoteTotal: number;
  remoteSeen: number;
  skippedUnsupported: number;
  skippedPaid: number;
  nextCursor?: string | null;
  historyComplete?: boolean;
  checkpointActivityIds?: string[];
}

export interface SyncContentPayload {
  item: CatalogItem;
  markdown: string;
  images: Array<{ url: string; relativePath: string }>;
  commentsMarkdown?: string;
  commentImages?: Array<{ url: string; relativePath: string }>;
}

export interface SyncContentMessage {
  type: 'sync.content';
  jobId: string;
  collectionId: string;
  payload: SyncContentPayload;
}

export interface SyncEventMessage {
  type: 'sync.event';
  jobId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface SyncCompleteRequest {
  type: 'sync.complete';
  jobId: string;
}

export interface SyncFailedMessage {
  type: 'sync.failed';
  jobId: string;
  message: string;
}

export interface SyncReadyMessage {
  type: 'sync.ready';
  protocolVersion: 1;
  jobId: string;
  dryRun: boolean;
  comments: boolean;
  mode: SyncMode;
  maxPages: number;
  minFreeGb: number;
  collections: SyncCollectionSpec[];
  votes?: {
    startUrl?: string;
    knownActivityIds: string[];
    backfillInProgress: boolean;
  };
}

export interface SyncPlanMessage {
  type: 'sync.plan';
  jobId: string;
  collectionId: string;
  actions: Array<{ id: string; action: SyncAction }>;
  summary: {
    remoteTotal: number;
    remoteSeen: number;
    supported: number;
    newCount: number;
    updateCount: number;
    unchangedCount: number;
    localOnlyCount: number;
    skippedUnsupported: number;
    skippedPaid: number;
  };
}

export interface SyncContentResultMessage {
  type: 'sync.content-result';
  jobId: string;
  collectionId: string;
  id: string;
  action: SyncAction;
  path: string;
}

export interface SyncCompleteMessage {
  type: 'sync.completed';
  jobId: string;
}

export interface SyncErrorMessage {
  type: 'sync.error';
  jobId?: string;
  code: string;
  message: string;
}

export type ExtensionToNativeMessage =
  | SyncHelloMessage
  | SyncCatalogMessage
  | SyncContentMessage
  | SyncEventMessage
  | SyncCompleteRequest
  | SyncFailedMessage;

export type NativeToExtensionMessage =
  | SyncReadyMessage
  | SyncPlanMessage
  | SyncContentResultMessage
  | SyncCompleteMessage
  | SyncErrorMessage;
