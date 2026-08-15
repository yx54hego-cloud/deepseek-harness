/**
 * Authenticated, end-to-end encrypted LAN carrier for the minimal DeepSeek
 * Harness mobile companion. The carrier exposes only Session list, history,
 * model selection, prompt submission, and their live events; it never
 * publishes the browser API.
 * @module @deepseek-ai/dsh-host-mobile-access
 */

import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import type { AddressInfo } from 'node:net'
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import QRCode from 'qrcode'
import { WebSocketServer } from 'ws'
import { MobileChannel } from './channel.ts'
import { loadOrCreateMobileIdentity } from './identity.ts'
import { encodePairingUrl } from './pairing.ts'

/** Stable Cordis service and plugin name. */
export const name = 'host-mobile-access'

/** Mobile listener configuration. */
export interface Config {
  /** Whether this composition should bind the mobile listener. */
  enabled: boolean
  /** Listen host. All interfaces is safe only because every application frame is authenticated and encrypted. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero asks the OS for a free port. */
  port: number
  /** Host or IP embedded in the pairing offer; omitted uses the operating system's default-route IPv4. */
  advertiseHost?: string
  /** Optional Harness home override for the persistent mobile identity. */
  dshHome?: string
  /** Print the pairing URL and terminal QR after the listener binds. */
  printPairingCode: boolean
  /** Maximum encrypted WebSocket frame bytes accepted from one phone. */
  maxPayloadBytes: number
}

/** Validated plugin configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).default('0.0.0.0'),
  port: z.natural().max(65535).default(6769),
  advertiseHost: z.string(),
  dshHome: z.string(),
  printPairingCode: z.boolean().default(true),
  maxPayloadBytes: z.number().step(1).min(1024 * 1024).default(16 * 1024 * 1024),
})

const ROUTE_PROBE_HOST = '192.0.2.1'
const ROUTE_PROBE_PORT = 9
const ROUTE_PROBE_TIMEOUT_MS = 1_000

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Bound authenticated mobile carrier. */
    mobileAccess: MobileAccess
  }
}

/**
 * Resolve a phone-reachable address, failing rather than printing an unusable offer.
 * @param config - listener host plus an optional explicit advertised host.
 * @param preferredAddress - IPv4 selected by the operating system's default route.
 * @returns bare hostname or IPv4 address for the pairing offer.
 */
export function resolveAdvertiseHost(
  config: Pick<Config, 'host' | 'advertiseHost'>,
  preferredAddress?: string,
): string {
  if (config.advertiseHost !== undefined) {
    const value = config.advertiseHost.trim()
    if (value.length === 0 || /[/:?#\s]/.test(value)) {
      throw new Error('mobile-access: advertiseHost must be a bare hostname or IPv4 address')
    }
    return value
  }
  if (config.host === '127.0.0.1') return config.host
  const addresses = Object.values(networkInterfaces()).flat()
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== undefined && candidate.family === 'IPv4' && !candidate.internal)
    .map(candidate => candidate.address)
  if (preferredAddress !== undefined && addresses.includes(preferredAddress)) return preferredAddress
  if (addresses.length === 1) return addresses[0] as string
  if (addresses.length === 0) {
    throw new Error('mobile-access: no LAN IPv4 address found; configure advertiseHost explicitly')
  }
  throw new Error('mobile-access: multiple LAN IPv4 addresses found and no default route was resolved; configure advertiseHost explicitly')
}

/** Resolve the IPv4 address selected by the operating system's default route without sending a datagram. */
async function resolveDefaultRouteAddress(): Promise<string | undefined> {
  return await new Promise((resolve) => {
    const socket = createSocket('udp4')
    let settled = false
    const finish = (address: string | undefined): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.close()
      resolve(address)
    }
    const timer = setTimeout(() => { finish(undefined) }, ROUTE_PROBE_TIMEOUT_MS)
    socket.once('error', () => { finish(undefined) })
    socket.connect(ROUTE_PROBE_PORT, ROUTE_PROBE_HOST, () => {
      const address = socket.address()
      finish(address.family === 'IPv4' ? address.address : undefined)
    })
  })
}

/** Authenticated WebSocket listener and its current pairing URL. */
export class MobileAccess extends Service {
  static inject = ['apiProxy']
  static Config = Config

  private server!: WebSocketServer
  private pairingUrlValue!: string
  private boundPort!: number

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'mobileAccess')
  }

  /** Actual bound port, including an OS-assigned value for configured port zero. */
  get port(): number {
    return this.boundPort
  }

  /** Complete pairing URL for QR, paste, or deep-link intake. */
  get pairingUrl(): string {
    return this.pairingUrlValue
  }

  /** Load the durable identity, bind the listener, and publish pairing material. */
  async [Service.init](): Promise<void> {
    if (!this.config.enabled) return
    const preferredAddress = this.config.advertiseHost === undefined && this.config.host === '0.0.0.0'
      ? await resolveDefaultRouteAddress()
      : undefined
    const advertiseHost = resolveAdvertiseHost(this.config, preferredAddress)
    const identity = await loadOrCreateMobileIdentity(this.config.dshHome)
    this.server = new WebSocketServer({
      host: this.config.host,
      port: this.config.port,
      maxPayload: this.config.maxPayloadBytes,
      perMessageDeflate: false,
    })
    this.server.on('connection', (socket) => { new MobileChannel(this.ctx, socket, identity) })
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        reject(error)
      }
      this.server.once('listening', () => {
        this.server.off('error', onError)
        resolve()
      })
      this.server.once('error', onError)
    })
    this.server.on('error', (error) => {
      this.ctx.logger.error(error)
    })
    this.boundPort = (this.server.address() as AddressInfo).port
    this.pairingUrlValue = encodePairingUrl(`ws://${advertiseHost}:${String(this.boundPort)}`, identity)
    this.ctx.effect(() => async () => {
      for (const socket of this.server.clients) socket.terminate()
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          resolve()
        })
      })
    }, 'mobileAccess.listen')

    if (this.config.printPairingCode) {
      const qr = await QRCode.toString(this.pairingUrlValue, { type: 'terminal', small: true })
      console.log(`dsh mobile: ${this.pairingUrlValue}\n${qr}`)
    }
  }
}

export default MobileAccess
