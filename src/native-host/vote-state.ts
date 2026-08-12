import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface VoteSyncState {
  schemaVersion: 1;
  newestActivityIds: string[];
  backfillCursor: string | null;
  historyComplete: boolean;
  updatedAt: string;
}

export function voteStatePath(vaultRoot: string): string {
  return join(vaultRoot, '赞同的回答', 'vote-state.json');
}

export async function readVoteState(vaultRoot: string): Promise<VoteSyncState> {
  const path = voteStatePath(vaultRoot);
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as VoteSyncState;
    if (value.schemaVersion !== 1
        || !Array.isArray(value.newestActivityIds)
        || !value.newestActivityIds.every((id) => typeof id === 'string')
        || !(value.backfillCursor === null || typeof value.backfillCursor === 'string')
        || typeof value.historyComplete !== 'boolean') {
      throw new Error(`赞同同步状态结构无效: ${path}`);
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      schemaVersion: 1,
      newestActivityIds: [],
      backfillCursor: null,
      historyComplete: false,
      updatedAt: new Date(0).toISOString(),
    };
  }
}

export async function writeVoteState(vaultRoot: string, state: VoteSyncState): Promise<void> {
  const path = voteStatePath(vaultRoot);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  state.updatedAt = new Date().toISOString();
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
