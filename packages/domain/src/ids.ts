import { randomBytes } from 'node:crypto';

declare const uuidV7Brand: unique symbol;

export type UuidV7 = string & { readonly [uuidV7Brand]: 'UuidV7' };

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_UUID_V7_TIMESTAMP = 0xffffffffffff;

export function createUuidV7(timestamp: Date = new Date()): UuidV7 {
  const milliseconds = timestamp.getTime();

  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > MAX_UUID_V7_TIMESTAMP
  ) {
    throw new RangeError('UUID v7 timestamps must be a valid Unix millisecond timestamp.');
  }

  const time = BigInt(milliseconds);
  const random = randomBytes(10);
  const bytes = new Uint8Array(16);

  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((time >> BigInt((5 - index) * 8)) & 0xffn);
  }

  bytes[6] = 0x70 | (random[0] & 0x0f);
  bytes[7] = random[1];
  bytes[8] = 0x80 | (random[2] & 0x3f);
  bytes.set(random.subarray(3), 9);

  const hexadecimal = Buffer.from(bytes).toString('hex');
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}` as UuidV7;
}

export function parseUuidV7(value: string): UuidV7 {
  if (!UUID_V7_PATTERN.test(value)) {
    throw new TypeError('Expected a canonical UUID v7.');
  }

  return value as UuidV7;
}
