/** Secure persistence for the paired Harness hosts and the active selection. */

import * as SecureStore from 'expo-secure-store'
import { PairingOfferSchema, type PairingOffer } from './protocol'

const HOSTS_KEY = 'dsh.mobile.paired-hosts.v2'
const LEGACY_HOST_KEY = 'dsh.mobile.paired-host.v1'
const ACTIVE_HOST_KEY = 'dsh.mobile.active-host.v1'

/** One saved computer that can be selected from the device manager. */
export interface StoredPairedHost {
  id: string
  label: string
  offer: PairingOffer
  addedAt: number
}

function defaultLabel(offer: PairingOffer): string {
  try {
    const hostname = new URL(offer.endpoint).hostname
    if (hostname.length > 0) return `电脑 ${hostname}`
  } catch {
    // The pairing parser has already validated the endpoint; retain a stable fallback.
  }
  return `电脑 ${offer.deviceId.slice(0, 8)}`
}

function recordFor(offer: PairingOffer, previous?: StoredPairedHost): StoredPairedHost {
  return {
    id: offer.deviceId,
    label: previous?.label ?? defaultLabel(offer),
    offer,
    addedAt: previous?.addedAt ?? Date.now(),
  }
}

function parseRecords(raw: string): StoredPairedHost[] {
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error('Paired host storage is not a list')
  return value.map((entry): StoredPairedHost => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Paired host record is invalid')
    const record = entry as { id?: unknown; label?: unknown; offer?: unknown; addedAt?: unknown }
    const offer = PairingOfferSchema.parse(record.offer)
    if (typeof record.id !== 'string' || record.id !== offer.deviceId
      || typeof record.label !== 'string' || record.label.trim().length === 0
      || typeof record.addedAt !== 'number' || !Number.isFinite(record.addedAt)) {
      throw new Error('Paired host record is invalid')
    }
    return { id: record.id, label: record.label, offer, addedAt: record.addedAt }
  })
}

/** Load all saved hosts, migrating the previous single-host record once. */
export async function loadPairedHosts(): Promise<StoredPairedHost[]> {
  const raw = await SecureStore.getItemAsync(HOSTS_KEY)
  if (raw !== null) return parseRecords(raw)
  const legacy = await SecureStore.getItemAsync(LEGACY_HOST_KEY)
  if (legacy === null) return []
  const migrated = [recordFor(PairingOfferSchema.parse(JSON.parse(legacy)))]
  await SecureStore.setItemAsync(HOSTS_KEY, JSON.stringify(migrated))
  return migrated
}

/** Add or update one host while preserving its saved display name. */
export async function upsertPairedHost(offer: PairingOffer): Promise<StoredPairedHost[]> {
  const current = await loadPairedHosts()
  const existing = current.find(host => host.id === offer.deviceId)
  const next = [recordFor(offer, existing), ...current.filter(host => host.id !== offer.deviceId)]
  await SecureStore.setItemAsync(HOSTS_KEY, JSON.stringify(next))
  return next
}

/** Remove one host and its pairing material. */
export async function removePairedHost(id: string): Promise<StoredPairedHost[]> {
  const next = (await loadPairedHosts()).filter(host => host.id !== id)
  if (next.length === 0) await SecureStore.deleteItemAsync(HOSTS_KEY)
  else await SecureStore.setItemAsync(HOSTS_KEY, JSON.stringify(next))
  return next
}

/** Read the last selected host id, if it is still saved. */
export async function loadActiveHostId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_HOST_KEY)
}

/** Persist the selected host id for the next launch. */
export async function saveActiveHostId(id: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_HOST_KEY, id)
}

/** Clear the selected host id when no paired hosts remain. */
export async function clearActiveHostId(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_HOST_KEY)
}
