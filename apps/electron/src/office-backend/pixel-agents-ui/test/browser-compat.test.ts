import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureRandomUUID } from '../src/browserCompat.ts';

test('ensureRandomUUID adds an RFC 4122 v4 compatible fallback', () => {
  const cryptoLike = {
    getRandomValues(values: Uint8Array) {
      for (let index = 0; index < values.length; index++) {
        values[index] = index;
      }
      return values;
    },
  };

  ensureRandomUUID(cryptoLike);

  assert.equal(typeof cryptoLike.randomUUID, 'function');
  assert.match(
    cryptoLike.randomUUID!(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('ensureRandomUUID does not replace an existing implementation', () => {
  const existing = () => 'existing-uuid';
  const cryptoLike = {
    randomUUID: existing,
    getRandomValues(values: Uint8Array) {
      return values;
    },
  };

  ensureRandomUUID(cryptoLike);

  assert.equal(cryptoLike.randomUUID, existing);
});
