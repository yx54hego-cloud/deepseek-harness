/** Orca-style pairing offer encoding for the DeepSeek Harness mobile app. */

import type { MobileIdentity } from './identity.ts'

/** Current pairing-offer format. */
export const PAIRING_OFFER_VERSION = 1

/** Data embedded in a `dsh://pair?code=...` URL. */
export interface PairingOffer {
  /** Pairing format version. */
  v: typeof PAIRING_OFFER_VERSION
  /** Direct encrypted WebSocket endpoint. */
  endpoint: string
  /** Persistent host identifier displayed by the app. */
  deviceId: string
  /** Bearer credential sent only after encryption is established. */
  deviceToken: string
  /** Pinned Curve25519 host public key. */
  publicKeyB64: string
}

/**
 * Build the compact custom-scheme URL accepted by scan, paste, and deep-link flows.
 * @param endpoint - reachable WebSocket URL.
 * @param identity - persistent host identity.
 * @returns pairing URL containing base64url JSON in its `code` query parameter.
 */
export function encodePairingUrl(endpoint: string, identity: MobileIdentity): string {
  const offer: PairingOffer = {
    v: PAIRING_OFFER_VERSION,
    endpoint,
    deviceId: identity.deviceId,
    deviceToken: identity.deviceToken,
    publicKeyB64: identity.publicKeyB64,
  }
  const code = Buffer.from(JSON.stringify(offer)).toString('base64url')
  return `dsh://pair?code=${code}`
}
