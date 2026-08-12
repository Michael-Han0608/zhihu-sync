export interface CollectionConfig {
  id: string;
  name: string;
  outputDir?: string;
}

export interface SyncConfig {
  schemaVersion: 1;
  vaultRoot: string;
  extensionId?: string;
  collections: CollectionConfig[];
}

export interface LegacyProgress {
  collectionId: string;
  collectionName: string;
  articles: {
    exportedIds: string[];
    totalExported: number;
  };
  comments: {
    exportedArticles: string[];
    totalExported: number;
  };
}

export interface LocalArticleRecord {
  id: string;
  path: string;
  title?: string;
  source?: string;
  updated?: string;
  type?: string;
}

export interface CollectionCalibration {
  collectionId: string;
  collectionName: string;
  progressPath: string;
  articlesDir: string;
  progressTotal: number;
  progressEntryCount: number;
  progressUniqueIdCount: number;
  actualArticleCount: number;
  progressCommentTotal: number;
  actualCommentCount: number;
  missingOnDisk: string[];
  untrackedOnDisk: string[];
  duplicateProgressIds: string[];
  duplicateProgressEntryCount: number;
  duplicateIds: string[];
  invalidMarkdown: string[];
  errors: string[];
  hasDrift: boolean;
}

export interface CalibrationReport {
  vaultRoot: string;
  generatedAt: string;
  readOnly: true;
  collections: CollectionCalibration[];
  hasDrift: boolean;
}
