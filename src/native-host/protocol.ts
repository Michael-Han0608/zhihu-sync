const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

export function encodeNativeMessage(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length > DEFAULT_MAX_MESSAGE_BYTES) {
    throw new Error(`Native Messaging 消息过大: ${payload.length} bytes`);
  }
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class NativeMessageDecoder {
  private buffer = Buffer.alloc(0);

  constructor(private readonly maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES) {}

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > this.maxMessageBytes) {
        throw new Error(`Native Messaging 消息超过限制: ${length} bytes`);
      }
      if (this.buffer.length < 4 + length) break;
      const payload = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      try {
        messages.push(JSON.parse(payload));
      } catch {
        throw new Error('Native Messaging 收到无效 JSON');
      }
    }

    return messages;
  }
}
