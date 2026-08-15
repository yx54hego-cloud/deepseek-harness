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
  /** Optional host-computed tool render intent forwarded beside live events. */
  view?: unknown
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

/** One live process row projected from the Web session event stream. */
export interface LiveActivity {
  id: string
  kind: 'context' | 'thinking' | 'tool' | 'question' | 'turn' | 'step'
  title: string
  detail?: string
  status: 'active' | 'done' | 'waiting' | 'error'
  time: number
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

/** Read the text carried by nested reasoning, tool-result, or context blocks. */
function blockText(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  const item = value as { type?: unknown; text?: unknown; content?: unknown; block?: unknown }
  const own = item.type === 'text' || item.type === 'reasoning' || item.type === 'tool-result'
    ? typeof item.text === 'string' ? item.text : ''
    : ''
  const nested = Array.isArray(item.content) ? item.content.map(blockText).filter(Boolean).join('\n') : ''
  const block = item.block === undefined ? '' : blockText(item.block)
  return [own, nested, block].filter(Boolean).join('\n')
}

/** Read only reasoning blocks from an assembled assistant message. */
function reasoningText(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  const item = value as { type?: unknown; text?: unknown; content?: unknown; message?: unknown }
  const own = item.type === 'reasoning' && typeof item.text === 'string' ? item.text : ''
  const nested = Array.isArray(item.content) ? item.content.map(reasoningText).filter(Boolean).join('') : ''
  const message = item.message === undefined ? '' : reasoningText(item.message)
  return `${own}${nested}${message}`
}

/** Read the source attached to a durable user/context message. */
function messageSource(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const source = (value as { source?: unknown }).source
  return typeof source === 'object' && source !== null && !Array.isArray(source)
    ? source as Record<string, unknown>
    : null
}

/** Read the host's optional tool render intent while retaining a generic fallback. */
function toolViewText(value: unknown): { title?: string; detail?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const envelope = value as { view?: unknown }
  const view = typeof envelope.view === 'object' && envelope.view !== null && !Array.isArray(envelope.view)
    ? envelope.view as Record<string, unknown>
    : envelope as Record<string, unknown>
  const title = typeof view.title === 'string' ? view.title : undefined
  const rawInput = view.rawInput
  const output = typeof view.output === 'string' ? view.output : undefined
  const description = typeof view.description === 'string' ? view.description : undefined
  const content = Array.isArray(view.content) ? view.content.map(blockText).filter(Boolean).join('\n') : ''
  let detail = output ?? (content || description)
  if (detail === undefined && rawInput !== undefined) {
    detail = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)
  }
  return { ...(title ? { title } : {}), ...(detail ? { detail } : {}) }
}

/** Project the Web's live processing rows without changing the durable transcript. */
export function projectActivity(events: readonly SessionEvent[]): LiveActivity[] {
  const activities: LiveActivity[] = []
  const byId = new Map<string, LiveActivity>()
  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  const add = (activity: LiveActivity): void => {
    activities.push(activity)
    byId.set(activity.id, activity)
  }
  const update = (id: string, patch: Partial<LiveActivity>): void => {
    const current = byId.get(id)
    if (current === undefined) return
    Object.assign(current, patch)
  }
  const reasonLabel = (value: unknown): string => {
    if (typeof value !== 'object' || value === null) return ''
    const kind = (value as { kind?: unknown }).kind
    return typeof kind === 'string' ? kind : ''
  }

  for (const event of ordered) {
    const data = typeof event.data === 'object' && event.data !== null
      ? event.data as Record<string, unknown>
      : {}
    const turn = typeof data.turn === 'number' ? data.turn : undefined
    const step = typeof data.step === 'number' ? data.step : undefined
    if (event.type === 'turn/start' && turn !== undefined) {
      add({ id: `turn-${turn}`, kind: 'turn', title: `Turn ${turn}`, status: 'active', time: event.time })
      continue
    }
    if (event.type === 'turn/end' && turn !== undefined) {
      update(`turn-${turn}`, { status: 'done', detail: reasonLabel(data.reason) })
      continue
    }
    if (event.type === 'step/start' && turn !== undefined && step !== undefined) {
      add({ id: `step-${turn}-${step}`, kind: 'step', title: `Step ${step}`, status: 'active', time: event.time })
      continue
    }
    if (event.type === 'step/end' && turn !== undefined && step !== undefined) {
      update(`step-${turn}-${step}`, { status: 'done' })
      update(`thinking-${turn}-${step}`, { status: 'done' })
      continue
    }
    if (event.type === 'user/message') {
      const source = messageSource(event.data)
      if (source?.kind !== 'user') {
        const parts = messageParts(event.data)
        const plugin = typeof source?.plugin === 'string' ? source.plugin : 'context'
        const form = typeof source?.form === 'string' ? source.form : ''
        const title = form === 'instructions'
          ? `Context · ${plugin}`
          : form === 'catalog'
            ? `Context catalog · ${plugin}`
            : `Context · ${plugin}`
        const detail = parts.text || blockText(event.data)
        add({ id: `context-${event.seq}`, kind: 'context', title, ...(detail ? { detail } : {}), status: 'done', time: event.time })
      }
      continue
    }
    if (event.type === 'request/header' || event.type === 'request/context') {
      add({ id: `request-${event.seq}`, kind: 'context', title: 'Request context', detail: JSON.stringify(data), status: 'done', time: event.time })
      continue
    }
    if (event.type === 'assistant/chunk') {
      const chunk = data.chunk as {
        type?: unknown
        index?: unknown
        text?: unknown
        block?: unknown
        id?: unknown
        name?: unknown
        argumentsDelta?: unknown
      } | undefined
      if (turn === undefined || step === undefined || chunk === undefined) continue
      if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
        const id = `thinking-${turn}-${step}`
        const current = byId.get(id)
        if (current === undefined) add({ id, kind: 'thinking', title: 'Think', detail: chunk.text, status: 'active', time: event.time })
        else update(id, { detail: `${current.detail ?? ''}${chunk.text}`, status: 'active' })
      } else if (chunk.type === 'block-end' && typeof chunk.block === 'object' && chunk.block !== null
        && (chunk.block as { type?: unknown }).type === 'reasoning') {
        const id = `thinking-${turn}-${step}`
        const detail = blockText(chunk.block)
        if (byId.has(id)) update(id, { ...(detail ? { detail } : {}), status: 'done' })
      } else if (chunk.type === 'tool-call-delta' && typeof chunk.id === 'string') {
        const id = `tool-${chunk.id}`
        const current = byId.get(id)
        const delta = typeof chunk.argumentsDelta === 'string' ? chunk.argumentsDelta : ''
        if (current === undefined) add({ id, kind: 'tool', title: `Tool · ${typeof chunk.name === 'string' ? chunk.name : 'calling'}`, ...(delta ? { detail: delta } : {}), status: 'active', time: event.time })
        else update(id, { ...(delta ? { detail: `${current.detail ?? ''}${delta}` } : {}), status: 'active' })
      }
      continue
    }
    if (event.type === 'assistant/message' && turn !== undefined && step !== undefined) {
      const detail = reasoningText(data.message)
      if (detail.length > 0) {
        const id = `thinking-${turn}-${step}`
        if (byId.has(id)) update(id, { detail, status: 'done' })
        else add({ id, kind: 'thinking', title: 'Think', detail, status: 'done', time: event.time })
      }
      continue
    }
    if (event.type === 'tool/call') {
      const callId = typeof data.callId === 'string' ? data.callId : `seq-${event.seq}`
      const name = typeof data.name === 'string' ? data.name : 'tool'
      const id = `tool-${callId}`
      const view = toolViewText(event.view)
      const detail = view.detail ?? (typeof data.arguments === 'string' ? data.arguments : undefined)
      const title = view.title ?? `Tool · ${name}`
      if (byId.has(id)) update(id, { title, ...(detail ? { detail } : {}), status: 'active' })
      else add({ id, kind: 'tool', title, ...(detail ? { detail } : {}), status: 'active', time: event.time })
      continue
    }
    if (event.type === 'tool/result') {
      const message = data.message
      const source = messageSource(message)
      const callId = typeof source?.callId === 'string' ? source.callId : undefined
      if (callId === undefined) continue
      const result = blockText(message)
      const error = typeof data.error === 'object' && data.error !== null
        ? (data.error as { name?: unknown; code?: unknown })
        : undefined
      const view = toolViewText(event.view)
      update(`tool-${callId}`, {
        ...(view.detail ?? result ? { detail: view.detail ?? result } : {}),
        status: error === undefined ? 'done' : 'error',
      })
      continue
    }
    if (event.type === 'approval/asked' || event.type === 'approval/requested') {
      const id = typeof data.id === 'string' ? data.id : typeof data.approvalId === 'string' ? data.approvalId : `seq-${event.seq}`
      const toolName = typeof data.toolName === 'string' ? data.toolName : 'tool'
      add({ id: `question-${id}`, kind: 'question', title: `Approval · ${toolName}`, ...(typeof data.reason === 'string' ? { detail: data.reason } : {}), status: 'waiting', time: event.time })
      continue
    }
    if (event.type === 'approval/decided' || event.type === 'approval/resolved') {
      const id = typeof data.id === 'string' ? data.id : typeof data.approvalId === 'string' ? data.approvalId : ''
      const outcome = typeof data.outcome === 'string' ? data.outcome : ''
      update(`question-${id}`, { status: outcome === 'allowed-once' ? 'done' : 'error', detail: outcome })
      continue
    }
    if (event.type === 'question/requested') {
      const questions = Array.isArray(data.questions) ? data.questions : []
      const detail = questions.map((question) => {
        if (typeof question !== 'object' || question === null) return ''
        const value = question as { header?: unknown; question?: unknown; detail?: unknown }
        const label = typeof value.header === 'string' ? value.header : typeof value.question === 'string' ? value.question : ''
        const extra = typeof value.detail === 'string' ? value.detail : ''
        return [label, extra].filter(Boolean).join(': ')
      }).filter(Boolean).join('\n')
      add({ id: `question-live-${event.seq}`, kind: 'question', title: 'Question', ...(detail ? { detail } : {}), status: 'waiting', time: event.time })
      continue
    }
    if (event.type === 'question/resolved') {
      const pending = [...activities].reverse().find(activity => activity.kind === 'question' && activity.status === 'waiting')
      if (pending !== undefined) update(pending.id, {
        status: data.outcome === 'answered' ? 'done' : 'error',
        ...(typeof data.outcome === 'string' ? { detail: data.outcome } : {}),
      })
    }
  }
  return activities
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
      if (messageSource(event.data)?.kind !== undefined && messageSource(event.data)?.kind !== 'user') continue
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
