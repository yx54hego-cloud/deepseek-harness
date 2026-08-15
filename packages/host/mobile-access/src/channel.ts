/** One authenticated mobile WebSocket connection. */

import { timingSafeEqual } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { RpcId, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import type { HostFrame, MuxFrame, ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { WebSocket, RawData } from 'ws'
import { z } from 'zod'
import { decodeKey, decrypt, deriveSharedKey, encrypt } from './crypto.ts'
import type { MobileIdentity } from './identity.ts'

const HANDSHAKE_TIMEOUT_MS = 10_000
const MAX_OUTSTANDING_REQUESTS = 8
const MAX_OUTBOUND_BUFFER_BYTES = 8 * 1024 * 1024

const helloSchema = z.object({
  type: z.literal('e2ee_hello'),
  publicKeyB64: z.string(),
}).strict()

const authSchema = z.object({
  type: z.literal('e2ee_auth'),
  deviceToken: z.string(),
}).strict()

const listRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.list'),
  payload: z.object({ cursor: z.string().optional() }).strict(),
}).strict()

const createSessionRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.create'),
  payload: z.object({
    sessionId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    cwd: z.string().optional(),
    agentPreset: z.string().optional(),
  }).strict(),
}).strict()

const workspaceListRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('workspace.list'),
  payload: z.object({}).strict(),
}).strict()

const archivedSessionsRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('mobile.archivedSessions'),
  payload: z.object({}).strict(),
}).strict()

const historyRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.history'),
  payload: z.object({
    sessionId: z.string(),
    beforeSeq: z.number().int().nonnegative().optional(),
    maxMessages: z.number().int().min(1).max(200).optional(),
  }).strict(),
}).strict()

const modelsRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.models'),
  payload: z.object({ sessionId: z.string() }).strict(),
}).strict()

const selectModelRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.selectModel'),
  payload: z.object({
    sessionId: z.string(),
    provider: z.string().min(1),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1).optional(),
  }).strict(),
}).strict()

const attachmentRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.attachment'),
  payload: z.object({ sessionId: z.string(), attachmentId: z.string().min(1) }).strict(),
}).strict()

const promptContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(100_000) }).strict(),
  z.object({
    type: z.literal('image'),
    mediaType: z.union([
      z.literal('image/png'),
      z.literal('image/jpeg'),
      z.literal('image/webp'),
      z.literal('image/gif'),
    ]),
    data: z.string().min(1),
    name: z.string().max(512).optional(),
  }).strict(),
])

const promptRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string().max(128),
  method: z.literal('session.prompt'),
  payload: z.object({
    sessionId: z.string(),
    mode: z.literal('queue'),
    content: z.array(promptContentSchema).min(1),
    clientTimeZone: z.string().optional(),
  }).strict(),
}).strict()

const mobileRequestSchema = z.discriminatedUnion('method', [
  createSessionRequestSchema,
  workspaceListRequestSchema,
  listRequestSchema,
  historyRequestSchema,
  modelsRequestSchema,
  selectModelRequestSchema,
  attachmentRequestSchema,
  promptRequestSchema,
  archivedSessionsRequestSchema,
])

/** Mux events needed to mirror the conversation transcript and live process surface. */
function isMobileMuxFrame(frame: MuxFrame): boolean {
  return frame.type === 'session/event'
    || frame.type === 'session/subscribed'
    || frame.type === 'session/projection'
    || frame.type === 'approval/requested'
    || frame.type === 'approval/resolved'
    || frame.type === 'question/requested'
    || frame.type === 'question/resolved'
}

/** Host lifecycle frames used by the mobile session list, excluding unrelated host state. */
function isMobileHostFrame(frame: HostFrame): boolean {
  return frame.type === 'host/session-added'
    || frame.type === 'host/session-removed'
    || frame.type === 'host/session-status'
    || frame.type === 'host/archived-sessions-changed'
}

/** Constant-time comparison for equal-length UTF-8 credentials. */
function tokenMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes)
}

/** Convert WebSocket raw data to a text frame without accepting binary messages. */
function textFrame(data: RawData, binary: boolean): string | null {
  if (binary) return null
  return typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8')
}

/** Per-socket E2EE handshake, request dispatch, and live event forwarding. */
export class MobileChannel {
  private state: 'awaiting-hello' | 'awaiting-auth' | 'ready' | 'closed' = 'awaiting-hello'
  private sharedKey: Uint8Array | undefined
  private outstanding = 0
  private readonly abort = new AbortController()
  private readonly handshakeTimer: ReturnType<typeof setTimeout>
  private readonly handler

  constructor(
    private readonly ctx: Context,
    private readonly socket: WebSocket,
    private readonly identity: MobileIdentity,
  ) {
    this.handler = toFetchHandler(ctx.apiProxy)
    this.handshakeTimer = setTimeout(() => {
      this.close(4002, 'handshake timeout')
    }, HANDSHAKE_TIMEOUT_MS)
    socket.on('message', (data, binary) => { void this.onRawMessage(data, binary) })
    socket.once('close', () => {
      this.dispose()
    })
    socket.once('error', (error) => {
      ctx.logger.warn(error)
    })
  }

  /** Clear per-connection resources; safe after either peer or host closure. */
  dispose(): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    clearTimeout(this.handshakeTimer)
    this.sharedKey = undefined
    this.abort.abort()
  }

  /** Process one plaintext handshake frame or encrypted application frame. */
  private async onRawMessage(data: RawData, binary: boolean): Promise<void> {
    const raw = textFrame(data, binary)
    if (raw === null) {
      this.close(4001, 'text frames required')
      return
    }
    if (this.state === 'awaiting-hello') {
      this.acceptHello(raw)
      return
    }
    const key = this.sharedKey
    if (key === undefined) return
    const plaintext = decrypt(raw, key)
    if (plaintext === null) {
      this.close(4001, 'authentication failed')
      return
    }
    if (this.state === 'awaiting-auth') {
      this.acceptAuth(plaintext)
      return
    }
    if (this.state !== 'ready') return
    try {
      await this.dispatch(plaintext)
    } catch (error: unknown) {
      // Keep an unexpected carrier bug local to this socket. The app-level
      // fail-loud handler must not terminate the entire Web/Host process for
      // one malformed or failing mobile request.
      this.ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
      this.close(1011, 'mobile request failed')
    }
  }

  /** Complete Curve25519 key agreement from the phone's ephemeral public key. */
  private acceptHello(raw: string): void {
    try {
      const hello = helloSchema.parse(JSON.parse(raw))
      const clientPublicKey = decodeKey(hello.publicKeyB64, 'e2ee_hello.publicKeyB64')
      const serverSecretKey = decodeKey(this.identity.secretKeyB64, 'identity.secretKeyB64')
      this.sharedKey = deriveSharedKey(serverSecretKey, clientPublicKey)
      this.state = 'awaiting-auth'
      this.socket.send(JSON.stringify({ type: 'e2ee_ready' }))
    } catch {
      this.close(4001, 'invalid e2ee_hello')
    }
  }

  /** Authenticate the paired installation inside the encrypted channel. */
  private acceptAuth(plaintext: string): void {
    try {
      const auth = authSchema.parse(JSON.parse(plaintext))
      if (!tokenMatches(auth.deviceToken, this.identity.deviceToken)) {
        this.close(4001, 'unauthorized')
        return
      }
      this.state = 'ready'
      clearTimeout(this.handshakeTimer)
      this.sendEncrypted({ type: 'e2ee_authenticated' })
      void this.forwardEvents()
    } catch {
      this.close(4001, 'invalid e2ee_auth')
    }
  }

  /** Validate the mobile allowlist and dispatch an accepted request. */
  private async dispatch(plaintext: string): Promise<void> {
    let request: z.infer<typeof mobileRequestSchema>
    try {
      request = mobileRequestSchema.parse(JSON.parse(plaintext))
    } catch {
      this.close(4001, 'invalid mobile request')
      return
    }
    if (this.outstanding >= MAX_OUTSTANDING_REQUESTS) {
      this.close(1013, 'too many requests')
      return
    }
    this.outstanding += 1
    try {
      if (request.method === 'mobile.archivedSessions') {
        const response = await this.ctx.apiProxy.workspace.list({ rpcId: RpcId(request.rpcId), payload: {} })
        this.sendEncrypted({
          type: 'server-response',
          rpcId: response.rpcId,
          result: response.result.ok
            ? { ok: true, value: { archivedSessionIds: response.result.value.archivedSessionIds } }
            : response.result,
        })
        return
      }
      try {
        const response = await this.handler.fetch(new Request(`http://dsh.internal/api/${request.method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        }))
        this.sendEncrypted(await response.json())
      } catch (error: unknown) {
        // A capability handler can reject after the carrier has authenticated.
        // Keep the Host alive and turn that rejection into the pending RPC's
        // business error instead of leaking an unhandled promise rejection to
        // app-boot's fail-loud process handler.
        this.ctx.logger.error(error instanceof Error ? error : new Error(String(error)))
        this.sendEncrypted({
          type: 'server-response',
          rpcId: RpcId(request.rpcId),
          result: {
            ok: false,
            error: { code: 'internal', message: 'mobile request failed', details: {} },
          },
        })
      }
    } finally {
      this.outstanding -= 1
    }
  }

  /** Open the two shared Harness event streams after authentication. */
  private async forwardEvents(): Promise<void> {
    try {
      await Promise.all([
        this.pump(this.ctx.apiProxy.events.mux({ rpcId: RpcId('mobile-mux'), payload: {} }, this.abort.signal), isMobileMuxFrame),
        this.pump(
          this.ctx.apiProxy.events.host({ rpcId: RpcId('mobile-host'), payload: {} }, this.abort.signal),
          isMobileHostFrame,
        ),
      ])
    } catch (error) {
      if (!this.abort.signal.aborted) {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        this.close(1011, 'event stream failed')
      }
    }
  }

  /** Encrypt selected stream frames as the existing server-request envelope. */
  private async pump<T extends { type: string }>(
    stream: AsyncIterable<{ rpcId: RpcId; payload: T }>,
    include: (payload: T) => boolean,
  ): Promise<void> {
    for await (const frame of stream) {
      if (!include(frame.payload)) continue
      const request: ServerRequest = {
        type: 'server-request',
        rpcId: frame.rpcId,
        method: frame.payload.type,
        payload: frame.payload,
      }
      this.sendEncrypted(request)
    }
  }

  /** Encrypt and send one JSON document while enforcing the connection memory ceiling. */
  private sendEncrypted(value: unknown): void {
    const key = this.sharedKey
    if (this.state === 'closed' || key === undefined || this.socket.readyState !== this.socket.OPEN) return
    if (this.socket.bufferedAmount > MAX_OUTBOUND_BUFFER_BYTES) {
      this.close(1013, 'outbound buffer full')
      return
    }
    try {
      this.socket.send(encrypt(JSON.stringify(value), key))
    } catch (error: unknown) {
      this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /** Close with a bounded public reason and release owned streams. */
  private close(code: number, reason: string): void {
    if (this.state === 'closed') return
    this.socket.close(code, reason)
    this.dispose()
  }
}
