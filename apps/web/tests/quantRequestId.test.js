import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createQuantRequestId } from '../src/lib/quantRequestId.js';

test('chat IDs work without randomUUID and retain the backend request format', () => {
  // Matches older browsers and HTTP LAN contexts that lack randomUUID.
  const browserCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const ids = Array.from({ length: 100 }, () => createQuantRequestId(browserCrypto));
  for (const id of ids) assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('missing random source gives a readable error instead of a TypeError', () => {
  assert.throws(() => createQuantRequestId({}), /cannot generate a request ID/);
});
