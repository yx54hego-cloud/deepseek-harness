/** TweetNaCl E2EE primitives adapted to Expo's secure random source. */

import * as ExpoCrypto from 'expo-crypto'
import nacl from 'tweetnacl'

nacl.setPRNG((target: Uint8Array, length: number) => {
  target.set(ExpoCrypto.getRandomBytes(length))
})

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

/** Generate the phone's ephemeral Curve25519 key pair. */
export function generateKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair()
}

/** Encode a public key for `e2ee_hello`. */
export function publicKeyToBase64(key: Uint8Array): string {
  return bytesToBase64(key)
}

/** Derive a shared key from the ephemeral phone secret and pinned host public key. */
export function deriveSharedKey(secretKey: Uint8Array, hostPublicKeyB64: string): Uint8Array {
  const publicKey = base64ToBytes(hostPublicKeyB64)
  if (publicKey.byteLength !== nacl.box.publicKeyLength) throw new Error('Invalid host public key')
  return nacl.box.before(publicKey, secretKey)
}

/** Encrypt UTF-8 text as base64(nonce || ciphertext). */
export function encrypt(plaintext: string, sharedKey: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box.after(new TextEncoder().encode(plaintext), nonce, sharedKey)
  const frame = new Uint8Array(nonce.byteLength + ciphertext.byteLength)
  frame.set(nonce)
  frame.set(ciphertext, nonce.byteLength)
  return bytesToBase64(frame)
}

/** Authenticate and decrypt a server text frame. */
export function decrypt(frame: string, sharedKey: Uint8Array): string | null {
  const bytes = base64ToBytes(frame)
  if (bytes.byteLength < nacl.box.nonceLength + nacl.box.overheadLength) return null
  const plaintext = nacl.box.open.after(
    bytes.subarray(nacl.box.nonceLength),
    bytes.subarray(0, nacl.box.nonceLength),
    sharedKey,
  )
  return plaintext === null ? null : new TextDecoder().decode(plaintext)
}
