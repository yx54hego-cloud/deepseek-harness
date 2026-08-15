/** Durable server identity and pairing credential. */

import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import nacl from 'tweetnacl'
import { z } from 'zod'
import { decodeKey, generateKeyPair } from './crypto.ts'

/** Current on-disk mobile identity format. */
export const MOBILE_IDENTITY_VERSION = 1

const identitySchema = z.object({
  version: z.literal(MOBILE_IDENTITY_VERSION),
  deviceId: z.uuid(),
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  publicKeyB64: z.string(),
  secretKeyB64: z.string(),
}).strict()

/** Persistent host identity included in pairing offers and authentication checks. */
export type MobileIdentity = z.infer<typeof identitySchema>

/**
 * Resolve the private mobile identity file under the Harness home.
 * @param dshHome - optional Harness home override.
 * @returns absolute path to the mobile identity file.
 */
export function mobileIdentityPath(dshHome?: string): string {
  return join(resolveDshHome(dshHome), 'mobile', 'identity.json')
}

/**
 * Load the existing identity or atomically create one.
 * @param dshHome - optional Harness home override.
 * @returns validated persistent identity.
 */
export async function loadOrCreateMobileIdentity(dshHome?: string): Promise<MobileIdentity> {
  const path = mobileIdentityPath(dshHome)
  try {
    const identity = identitySchema.parse(JSON.parse(await readFile(path, 'utf8')))
    validateKeys(identity)
    return identity
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`mobile-access: invalid identity file at ${path}`, { cause: error })
    }
  }

  const keyPair = generateKeyPair()
  const identity: MobileIdentity = {
    version: MOBILE_IDENTITY_VERSION,
    deviceId: randomUUID(),
    deviceToken: randomBytes(32).toString('base64url'),
    ...keyPair,
  }
  await writeFileAtomic(path, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  return identity
}

/** Reject mismatched or malformed persistent key material during startup. */
function validateKeys(identity: MobileIdentity): void {
  const secretKey = decodeKey(identity.secretKeyB64, 'identity.secretKeyB64')
  const publicKey = decodeKey(identity.publicKeyB64, 'identity.publicKeyB64')
  const derived = Buffer.from(nacl.box.keyPair.fromSecretKey(secretKey).publicKey)
  if (!derived.equals(Buffer.from(publicKey))) {
    throw new Error('mobile-access: identity public and secret keys do not match')
  }
}
