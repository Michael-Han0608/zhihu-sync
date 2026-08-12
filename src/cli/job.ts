import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SyncMode } from '../shared/native-messages';

export const DEFAULT_JOBS_DIR = join(homedir(), '.config', 'zhihu-sync', 'jobs');

export interface SyncJobRequest {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  configPath: string;
  dryRun: boolean;
  comments: boolean;
  mode: SyncMode;
  maxPages: number;
  minFreeGb: number;
  collectionIds: string[];
}

export interface SyncJobCollectionSummary {
  id: string;
  name: string;
  remoteTotal: number;
  remoteSeen: number;
  supported: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  localOnlyCount: number;
  skippedUnsupported: number;
  skippedPaid: number;
  written: number;
  commentsWritten: number;
  newIds: string[];
  updateIds: string[];
}

export interface SyncJobStatus {
  schemaVersion: 1;
  id: string;
  state: 'pending' | 'running' | 'completed' | 'failed';
  updatedAt: string;
  dryRun: boolean;
  mode: SyncMode;
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }>;
  collections: SyncJobCollectionSummary[];
  error?: string;
}

function assertJobId(jobId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) throw new Error('无效 jobId');
}

export function requestPath(jobId: string): string {
  assertJobId(jobId);
  return join(DEFAULT_JOBS_DIR, `${jobId}.request.json`);
}

export function statusPath(jobId: string): string {
  assertJobId(jobId);
  return join(DEFAULT_JOBS_DIR, `${jobId}.status.json`);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(DEFAULT_JOBS_DIR, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function createSyncJob(input: Omit<SyncJobRequest, 'schemaVersion' | 'id' | 'createdAt'>): Promise<SyncJobRequest> {
  const job: SyncJobRequest = {
    schemaVersion: 1,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  const status: SyncJobStatus = {
    schemaVersion: 1,
    id: job.id,
    state: 'pending',
    updatedAt: job.createdAt,
    dryRun: job.dryRun,
    mode: job.mode,
    logs: [],
    collections: [],
  };
  await writeJsonAtomic(requestPath(job.id), job);
  await writeJsonAtomic(statusPath(job.id), status);
  return job;
}

export async function readSyncJob(jobId: string): Promise<SyncJobRequest> {
  const value = JSON.parse(await readFile(requestPath(jobId), 'utf8')) as SyncJobRequest;
  if (value.schemaVersion !== 1 || value.id !== jobId || typeof value.configPath !== 'string') {
    throw new Error(`任务文件无效: ${jobId}`);
  }
  return value;
}

export async function readJobStatus(jobId: string): Promise<SyncJobStatus> {
  return JSON.parse(await readFile(statusPath(jobId), 'utf8')) as SyncJobStatus;
}

export async function writeJobStatus(status: SyncJobStatus): Promise<void> {
  status.updatedAt = new Date().toISOString();
  await writeJsonAtomic(statusPath(status.id), status);
}

export async function appendJobLog(
  status: SyncJobStatus,
  level: 'info' | 'warn' | 'error',
  message: string,
): Promise<void> {
  status.logs.push({ time: new Date().toISOString(), level, message });
  await writeJobStatus(status);
}

export async function markJobFailed(jobId: string, error: unknown): Promise<void> {
  const status = await readJobStatus(jobId);
  if (status.state === 'completed') return;
  status.state = 'failed';
  status.error = error instanceof Error ? error.message : String(error);
  await appendJobLog(status, 'error', status.error);
}
