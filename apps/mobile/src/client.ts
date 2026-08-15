/** Reconnecting encrypted client for the mobile carrier's narrow RPC surface. */

import * as ExpoCrypto from 'expo-crypto'
import { decrypt, deriveSharedKey, encrypt, generateKeyPair, publicKeyToBase64 } from './crypto'
import type { PairingOffer } from './protocol'

/** User-visible transport state. */
export type ConnectionStatus = 'connecting' | 'connected' | 'offline' | 'error'

interface ServerResponse {
  type: 'server-response'
  rpcId: string
  result: { ok: true; value?: unknown } | { ok: false; error: { message: string; code: string; details?: unknown } }
}

/** Structured error returned by the paired Host for one rejected RPC. */
export class MobileRpcError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'MobileRpcError'
  }
}

interface ServerRequest {
  type: 'server-request'
  rpcId: string
  method: string
  payload: unknown
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000]
const CONNECTION_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 60_000

/** One host connection with ephemeral key exchange on every socket. */
export class MobileClient {
  private socket: WebSocket | null = null
  private sharedKey: Uint8Array | null = null
  private phase: 'idle' | 'awaiting-ready' | 'awaiting-auth' | 'ready' = 'idle'
  private stopped = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectionTimer: ReturnType<typeof setTimeout> | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>()
  private readonly eventListeners = new Set<(request: ServerRequest) => void>()

  constructor(private readonly offer: PairingOffer) {}

  /** Start or resume the reconnect loop. */
  start(): void {
    if (!this.stopped && this.socket !== null) return
    this.stopped = false
    this.connect()
  }

  /** Stop reconnecting, close the socket, and reject outstanding calls. */
  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.clearConnectionTimer()
    this.socket?.close()
    this.socket = null
    this.phase = 'idle'
    this.sharedKey = null
    this.rejectPending(new Error('Disconnected'))
    this.emitStatus('offline')
  }

  /** Discard the current attempt and reconnect immediately. */
  restart(): void {
    this.stop()
    this.start()
  }

  /** Subscribe to connection-state changes. */
  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /** Subscribe to live Harness server-request frames. */
  onEvent(listener: (request: ServerRequest) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  /**
   * Send one allowlisted Harness request.
   * @param method - Method accepted by the host carrier.
   * @param payload - method payload.
   * @returns successful response value.
   */
  request<T>(
    method: 'session.create' | 'session.list' | 'session.history' | 'session.models' | 'session.selectModel' | 'session.attachment' | 'session.prompt' | 'workspace.list' | 'mobile.archivedSessions',
    payload: unknown,
  ): Promise<T> {
    if (this.phase !== 'ready' || this.socket?.readyState !== WebSocket.OPEN || this.sharedKey === null) {
      return Promise.reject(new Error('Phone is not connected to the Harness host'))
    }
    const rpcId = ExpoCrypto.randomUUID()
    const body = { type: 'client-request', rpcId, method, payload }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rpcId)
        reject(new Error('The host did not answer in time'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(rpcId, {
        resolve: (value) => {
          resolve(value as T)
        },
        reject,
        timer,
      })
      this.socket?.send(encrypt(JSON.stringify(body), this.sharedKey as Uint8Array))
    })
  }

  /** Create a fresh ephemeral key pair and open the direct WebSocket. */
  private connect(): void {
    if (this.stopped) return
    this.emitStatus('connecting')
    const keyPair = generateKeyPair()
    const socket = new WebSocket(this.offer.endpoint)
    this.socket = socket
    this.phase = 'awaiting-ready'
    this.sharedKey = deriveSharedKey(keyPair.secretKey, this.offer.publicKeyB64)
    this.connectionTimer = setTimeout(() => {
      if (this.socket !== socket || this.phase === 'ready') return
      this.emitStatus('error')
      socket.close()
    }, CONNECTION_TIMEOUT_MS)
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: publicKeyToBase64(keyPair.publicKey) }))
    }
    socket.onmessage = (event) => {
      this.accept(String(event.data))
    }
    socket.onerror = () => {
      if (this.socket !== socket) return
      this.emitStatus('error')
      socket.close()
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.clearConnectionTimer()
      this.socket = null
      this.phase = 'idle'
      this.sharedKey = null
      this.rejectPending(new Error('Connection to the Harness host closed'))
      if (!this.stopped) this.scheduleReconnect()
    }
  }

  /** Complete handshake control frames, then route encrypted RPC messages. */
  private accept(raw: string): void {
    if (this.phase === 'awaiting-ready') {
      try {
        const ready = JSON.parse(raw) as { type?: unknown }
        if (ready.type !== 'e2ee_ready' || this.sharedKey === null) throw new Error('Unexpected handshake response')
        this.phase = 'awaiting-auth'
        this.socket?.send(encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: this.offer.deviceToken }), this.sharedKey))
      } catch {
        this.failHandshake()
      }
      return
    }
    const key = this.sharedKey
    if (key === null) return
    const plaintext = decrypt(raw, key)
    if (plaintext === null) {
      this.failHandshake()
      return
    }
    try {
      const message = JSON.parse(plaintext) as { type?: unknown }
      if (this.phase === 'awaiting-auth') {
        if (message.type !== 'e2ee_authenticated') throw new Error('Authentication rejected')
        this.phase = 'ready'
        this.reconnectAttempt = 0
        this.clearConnectionTimer()
        this.emitStatus('connected')
        return
      }
      if (message.type === 'server-response') this.acceptResponse(message as ServerResponse)
      else if (message.type === 'server-request') {
        for (const listener of this.eventListeners) {
          try {
            listener(message as ServerRequest)
          } catch (error: unknown) {
            // A UI event projection must not tear down the authenticated RPC
            // channel or discard an unrelated response (notably session.create).
            console.warn('Mobile event listener failed', error)
          }
        }
      }
    } catch {
      this.socket?.close()
    }
  }

  /** Resolve one pending call by its opaque RPC id. */
  private acceptResponse(response: ServerResponse): void {
    const request = this.pending.get(response.rpcId)
    if (request === undefined) return
    clearTimeout(request.timer)
    this.pending.delete(response.rpcId)
    if (response.result.ok) request.resolve(response.result.value)
    else request.reject(new MobileRpcError(response.result.error.code, response.result.error.message, response.result.error.details))
  }

  /** Close an unauthenticated socket and surface the failure. */
  private failHandshake(): void {
    this.emitStatus('error')
    this.socket?.close()
  }

  /** Retry with a bounded exponential schedule. */
  private scheduleReconnect(): void {
    this.emitStatus('offline')
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  /** Reject and clear calls that cannot survive reconnect without duplication risk. */
  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }

  /** Clear the deadline shared by socket opening and encrypted authentication. */
  private clearConnectionTimer(): void {
    if (this.connectionTimer !== null) clearTimeout(this.connectionTimer)
    this.connectionTimer = null
  }

  /** Publish one transport-state transition. */
  private emitStatus(status: ConnectionStatus): void {
    for (const listener of this.statusListeners) listener(status)
  }
}
