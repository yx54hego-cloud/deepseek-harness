/** Mobile pairing and narrow Harness wire types. */

import { z } from 'zod'

/** Persisted pairing offer received from the host. */
export const PairingOfferSchema = z.object({
  v: z.literal(1),
  endpoint: z.string().regex(/^ws:\/\//),
  deviceId: z.uuid(),
  deviceToken: z.string().min(1),
  publicKeyB64: z.string().min(1),
}).strict()

/** Validated pairing offer. */
export type PairingOffer = z.infer<typeof PairingOfferSchema>

/** One Session list entry consumed by the companion. */
export interface SessionSummary {
  sessionId: string
  updatedAt: number
  running: boolean
  blank: boolean
  origin?: 'subagent'
  cwd?: string
  projections?: { asOfSeq: number; values: { title?: string | null; imageLimits?: ImageAttachmentLimits } }
}

/** Host-owned workspace row used to keep mobile session creation in the selected workspace. */
export interface WorkspaceSummary {
  workspaceId: string
  path: string
  title: string
  sessionIds: readonly string[]
}

/** Raster image formats accepted by the Harness attachment service. */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Host-owned image intake limits projected with the latest history page. */
export interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  mediaTypes: readonly ImageMediaType[]
}

/** Complete provider/model selection used by the next assembled turn. */
export interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Optional reasoning choices advertised for one exact model. */
export interface ModelReasoning {
  efforts: readonly { id: string; name: string; description?: string }[]
  defaultEffort?: string
}

/** One model advertised by a configured provider. */
export interface ModelCatalogModel {
  id: string
  name: string
  description?: string
  reasoning?: ModelReasoning
}

/** Provider-grouped model directory returned by the paired host. */
export interface ModelProviderGroup {
  id: string
  name: string
  models: readonly ModelCatalogModel[]
}

/** One provider-local catalog failure that does not hide successful providers. */
export interface ModelCatalogFailure {
  id: string
  name: string
  message: string
}

/** Fresh model directory and current selection for one session. */
export interface SessionModels {
  current: ModelSelection
  routable: boolean
  groups: readonly ModelProviderGroup[]
  failures: readonly ModelCatalogFailure[]
}

/** Raw durable event needed by the minimal transcript projection. */
export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: unknown
  surfaceOp?: 'append' | 'replace'
}

/** Mobile-visible transcript message. */
export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  images?: readonly TranscriptImage[]
  time: number
  streaming?: boolean
}

/** Durable image reference carried by a transcript message. */
export interface TranscriptImage {
  attachmentId: string
  mediaType: ImageMediaType
  name?: string
}

/** Extract a query parameter without depending on browser URL support in Hermes. */
function queryCode(url: string): string | null {
  const match = /^dsh:\/\/pair\/?\?([^#]+)$/i.exec(url.trim())
  if (match?.[1] === undefined) return null
  for (const part of match[1].split('&')) {
    const [key, value] = part.split('=', 2)
    if (key === 'code' && value !== undefined) return decodeURIComponent(value)
  }
  return null
}

/**
 * Parse a custom-scheme pairing URL or its bare base64url code.
 * @param input - scan, paste, or deep-link value.
 * @returns validated offer, otherwise null.
 */
export function parsePairingInput(input: string): PairingOffer | null {
  try {
    const trimmed = input.trim()
    const code = /^dsh:\/\//i.test(trimmed) ? queryCode(trimmed) : trimmed
    if (code === null || code.length === 0) return null
    const base64 = code.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${base64}${'='.repeat((4 - base64.length % 4) % 4)}`
    return PairingOfferSchema.parse(JSON.parse(atob(padded)))
  } catch {
    return null
  }
}

/** Read visible text and durable image references from one provider-neutral message. */
function messageParts(value: unknown): { text: string; images: TranscriptImage[] } {
  if (typeof value !== 'object' || value === null) return { text: '', images: [] }
  const content = (value as { content?: unknown }).content
  if (!Array.isArray(content)) return { text: '', images: [] }
  const text: string[] = []
  const images: TranscriptImage[] = []
  const visit = (block: unknown): void => {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) return
    const item = block as { type?: unknown; text?: unknown; attachment?: unknown; content?: unknown }
    if (item.type === 'text' && typeof item.text === 'string') text.push(item.text)
    if (item.type === 'image' && typeof item.attachment === 'object' && item.attachment !== null) {
      const attachment = item.attachment as { attachmentId?: unknown; mediaType?: unknown; name?: unknown }
      if (typeof attachment.attachmentId === 'string'
        && (attachment.mediaType === 'image/png' || attachment.mediaType === 'image/jpeg'
          || attachment.mediaType === 'image/webp' || attachment.mediaType === 'image/gif')) {
        images.push({
          attachmentId: attachment.attachmentId,
          mediaType: attachment.mediaType,
          ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
        })
      }
    }
    if (Array.isArray(item.content)) item.content.forEach(visit)
  }
  content.forEach(visit)
  return { text: text.join('\n'), images }
}

/**
 * Project raw history and live events into plain-text conversation rows.
 * @param events - contiguous durable Session events.
 * @returns visible user, assistant, and in-flight assistant text.
 */
export function projectTranscript(events: readonly SessionEvent[]): TranscriptMessage[] {
  const messages: TranscriptMessage[] = []
  const partials = new Map<string, TranscriptMessage>()
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.surfaceOp === 'replace') continue
    if (event.type === 'user/message') {
      const parts = messageParts(event.data)
      if (parts.text.length > 0 || parts.images.length > 0) {
        messages.push({ id: `event-${event.seq}`, role: 'user', text: parts.text, time: event.time, ...(parts.images.length > 0 ? { images: parts.images } : {}) })
      }
      continue
    }
    if (event.type === 'assistant/chunk') {
      const data = event.data as { turn?: unknown; step?: unknown; chunk?: { type?: unknown; text?: unknown } }
      if (typeof data.turn !== 'number' || typeof data.step !== 'number'
        || data.chunk?.type !== 'text-delta' || typeof data.chunk.text !== 'string') continue
      const id = `partial-${String(data.turn)}-${String(data.step)}`
      const previous = partials.get(id)
      partials.set(id, {
        id,
        role: 'assistant',
        text: `${previous?.text ?? ''}${data.chunk.text}`,
        time: previous?.time ?? event.time,
        streaming: true,
      })
      continue
    }
    if (event.type === 'assistant/message') {
      const data = event.data as { turn?: unknown; step?: unknown; message?: unknown }
      if (typeof data.turn === 'number' && typeof data.step === 'number') {
        partials.delete(`partial-${String(data.turn)}-${String(data.step)}`)
      }
      const parts = messageParts(data.message)
      if (parts.text.length > 0 || parts.images.length > 0) {
        messages.push({ id: `event-${event.seq}`, role: 'assistant', text: parts.text, time: event.time, ...(parts.images.length > 0 ? { images: parts.images } : {}) })
      }
    }
  }
  return [...messages, ...partials.values()].sort((a, b) => a.time - b.time)
}
