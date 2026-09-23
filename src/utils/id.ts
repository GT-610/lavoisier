/**
 * Identifier helpers.
 *
 * `crypto.randomUUID` is available in every browser that supports the rest of
 * the stack, but it is only defined in secure contexts. The fallback keeps the
 * sandbox usable when the built site is opened over plain HTTP on a LAN.
 */
export function uid(prefix = 'id'): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined
  if (globalCrypto?.randomUUID) {
    return `${prefix}_${globalCrypto.randomUUID().slice(0, 8)}`
  }
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${random}`
}
