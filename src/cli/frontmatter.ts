import { open } from 'node:fs/promises';
import type { LocalArticleRecord } from './types';

const MAX_FRONTMATTER_BYTES = 16 * 1024;

function readScalar(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(?:"((?:\\\\.|[^"])*)"|'([^']*)'|([^\\n#]+))`, 'm'));
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (raw === undefined) return undefined;
  return raw.trim().replace(/\\"/g, '"');
}

export function parseArticleFrontmatter(text: string, path: string): LocalArticleRecord | null {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const frontmatter = text.slice(3, end);
  const id = readScalar(frontmatter, 'id');
  if (!id) return null;

  return {
    id,
    path,
    title: readScalar(frontmatter, 'title'),
    source: readScalar(frontmatter, 'source'),
    updated: readScalar(frontmatter, 'updated'),
    type: readScalar(frontmatter, 'type'),
  };
}

export async function readArticleFrontmatter(path: string): Promise<LocalArticleRecord | null> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(MAX_FRONTMATTER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return parseArticleFrontmatter(buffer.subarray(0, bytesRead).toString('utf8'), path);
  } finally {
    await handle.close();
  }
}
