interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function ensureRandomUUID(cryptoObject: CryptoLike | undefined = globalThis.crypto): void {
  if (
    !cryptoObject ||
    typeof cryptoObject.randomUUID === 'function' ||
    typeof cryptoObject.getRandomValues !== 'function'
  ) {
    return;
  }

  Object.defineProperty(cryptoObject, 'randomUUID', {
    configurable: true,
    writable: true,
    value: () => {
      const bytes = new Uint8Array(16);
      cryptoObject.getRandomValues!(bytes);

      // RFC 4122 version 4 UUID bits.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      return formatUuid(bytes);
    },
  });
}
