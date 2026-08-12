// @vitest-environment node

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EXTENSION_ID, EXTENSION_PUBLIC_KEY } from './extension-identity';

function deriveExtensionId(publicKey: string): string {
  const digest = createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => 'abcdefghijklmnop'[nibble])
    .join('');
}

describe('extension identity', () => {
  it('公开密钥与固定 ID 一致', () => {
    expect(deriveExtensionId(EXTENSION_PUBLIC_KEY)).toBe(EXTENSION_ID);
  });
});
