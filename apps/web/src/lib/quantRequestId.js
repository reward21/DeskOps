// getRandomValues also works in browsers/HTTP contexts without randomUUID.
// Keep the backend's 32-character hex format and 128 bits of random data.
export function createQuantRequestId(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.getRandomValues !== 'function') {
    throw new Error('This browser cannot generate a request ID. Open Quant in an updated browser.');
  }
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
