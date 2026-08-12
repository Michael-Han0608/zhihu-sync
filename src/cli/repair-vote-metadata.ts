import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface VoteMetadataRepairReport {
  scanned: number;
  changed: number;
  removedCollected: number;
  normalizedSources: number;
}

function extractFrontmatterValue(text: string, key: string): string | undefined {
  return text.match(new RegExp(`^${key}:\\s*"([^"]*)"`, 'm'))?.[1];
}

export async function repairVoteMetadata(vaultRoot: string): Promise<VoteMetadataRepairReport> {
  const articlesDir = join(vaultRoot, '赞同的回答', 'articles');
  const entries = await readdir(articlesDir, { withFileTypes: true });
  const report: VoteMetadataRepairReport = {
    scanned: 0,
    changed: 0,
    removedCollected: 0,
    normalizedSources: 0,
  };

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name.endsWith('-评论.md')) continue;
    report.scanned++;
    const path = join(articlesDir, entry.name);
    const original = await readFile(path, 'utf8');
    let updated = original;
    if (/^collected:\s*"[^"]*"\s*$/m.test(updated)) {
      updated = updated.replace(/^collected:\s*"[^"]*"\s*\n/m, '');
      report.removedCollected++;
    }
    const id = extractFrontmatterValue(updated, 'id');
    const source = extractFrontmatterValue(updated, 'source');
    // 旧 API URL 虽不够美观但可由已登录浏览器读取；没有问题 ID 时不猜造 URL。
    if (updated === original) continue;
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, updated);
    await rename(temporary, path);
    report.changed++;
  }
  return report;
}
