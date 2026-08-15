/** Authenticated-encryption primitives for the mobile carrier. */

import nacl from 'tweetnacl'

/** One Curve25519 key pair encoded for persistence or transport. */
export interface EncodedKeyPair {
  /** Base64 Curve25519 public key. */
  publicKeyB64: string
  /** Base64 Curve25519 secret key. */
  secretKeyB64: string
}

/**
 * Generate a Curve25519 key pair using TweetNaCl's platform CSPRNG.
 * @returns base64-encoded public and secret keys.
 */
export function generateKeyPair(): EncodedKeyPair {
  const pair = nacl.box.keyPair()
  return {
    publicKeyB64: Buffer.from(pair.publicKey).toString('base64'),
    secretKeyB64: Buffer.from(pair.secretKey).toString('base64'),
  }
}

/**
 * Decode one exact-length base64 key.
 * @param encoded - Base64 key material from a validated persistence or wire record.
 * @param label - Field name used in the rejection message.
 * @returns the 32-byte key.
 */
export function decodeKey(encoded: string, label: string): Uint8Array {
  const key = Buffer.from(encoded, 'base64')
  if (key.byteLength !== nacl.box.publicKeyLength || key.toString('base64') !== encoded) {
    throw new Error(`mobile-access: ${label} must be a canonical 32-byte base64 key`)
  }
  return new Uint8Array(key)
}

/**
 * Derive the connection key from this endpoint's secret and its peer's public key.
 * @param secretKey - this endpoint's Curve25519 secret key.
 * @param peerPublicKey - peer Curve25519 public key.
 * @returns the shared key used by authenticated frames.
 */
export function deriveSharedKey(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return nacl.box.before(peerPublicKey, secretKey)
}

/**
 * Encrypt one UTF-8 JSON document as base64(nonce || ciphertext).
 * @param plaintext - serialized JSON document.
 * @param sharedKey - per-connection shared key.
 * @returns transport text frame.
 */
export function encrypt(plaintext: string, sharedKey: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box.after(new TextEncoder().encode(plaintext), nonce, sharedKey)
  const frame = new Uint8Array(nonce.byteLength + ciphertext.byteLength)
  frame.set(nonce)
  frame.set(ciphertext, nonce.byteLength)
  return Buffer.from(frame).toString('base64')
}

/**
 * Authenticate and decrypt one encrypted text frame.
 * @param frame - canonical base64 frame.
 * @param sharedKey - per-connection shared key.
 * @returns plaintext on success, otherwise null.
 */
export function decrypt(frame: string, sharedKey: Uint8Array): string | null {
  const bytes = Buffer.from(frame, 'base64')
  if (bytes.toString('base64') !== frame || bytes.byteLength < nacl.box.nonceLength + nacl.box.overheadLength) return null
  const nonce = bytes.subarray(0, nacl.box.nonceLength)
  const ciphertext = bytes.subarray(nacl.box.nonceLength)
  const plaintext = nacl.box.open.after(ciphertext, nonce, sharedKey)
  return plaintext === null ? null : new TextDecoder().decode(plaintext)
}
