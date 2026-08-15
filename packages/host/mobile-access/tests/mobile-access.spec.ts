/** Real-Loader coverage for pairing, E2EE authentication, RPC allowlisting, events, and teardown. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { RpcId, type ApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { type RawData } from 'ws'
import MobileAccess from '../src/index.ts'
import { decrypt, deriveSharedKey, encrypt, generateKeyPair, decodeKey } from '../src/crypto.ts'

let root: string | undefined
let context: Context | undefined
let prompted: unknown
let selectedModel: unknown
let createdSession: unknown
let failNextHistory = false

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  prompted = undefined
  selectedModel = undefined
  createdSession = undefined
  failNextHistory = false
})

/** Fake business face mounted as a real sibling Loader row. */
function applyFakeApi(ctx: Context): void {
  const waitForAbort = async (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        resolve()
      }, { once: true })
    })
  }
  const api = {
    sessions: {
      create: async ({ rpcId, payload }: { rpcId: RpcId; payload: unknown }) => {
        createdSession = payload
        return { rpcId, result: { ok: true as const, value: { sessionId: 'session-created' } } }
      },
      list: async ({ rpcId }: { rpcId: RpcId }) => ({
        rpcId,
        result: { ok: true as const, value: { items: [{ sessionId: 'session-1', updatedAt: 10, running: false, blank: false }] } },
      }),
      history: async ({ rpcId }: { rpcId: RpcId }) => {
        if (failNextHistory) {
          failNextHistory = false
          throw new Error('simulated mobile handler failure')
        }
        return { rpcId, result: { ok: true as const, value: { events: [], hasMore: false } } }
      },
      models: async ({ rpcId }: { rpcId: RpcId }) => ({
        rpcId,
        result: {
          ok: true as const,
          value: {
            current: { provider: 'deepseek', model: 'deepseek-chat' },
            routable: true,
            groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] }],
            failures: [],
          },
        },
      }),
      selectModel: async ({ rpcId, payload }: { rpcId: RpcId; payload: unknown }) => {
        selectedModel = payload
        const request = payload as { provider: string; model: string; reasoningEffort?: string }
        return {
          rpcId,
          result: {
            ok: true as const,
            value: {
              selected: {
                provider: request.provider,
                model: request.model,
                ...request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort },
              },
            },
          },
        }
      },
      attachment: async ({ rpcId }: { rpcId: RpcId; payload: unknown }) => ({
        rpcId,
        result: {
          ok: true as const,
          value: { attachment: { attachmentId: 'sha256:one', mediaType: 'image/png', bytes: 1, width: 1, height: 1 }, data: 'AQ==' },
        },
      }),
      prompt: async ({ rpcId, payload }: { rpcId: RpcId; payload: unknown }) => {
        prompted = payload
        return { rpcId, result: { ok: true as const, value: { accepted: true } } }
      },
    },
    workspace: {
      list: async ({ rpcId }: { rpcId: RpcId }) => ({
        rpcId,
        result: { ok: true as const, value: { items: [], archivedSessionIds: ['session-archived'] } },
      }),
    },
    events: {
      mux: async function* ({ rpcId }: { rpcId: RpcId }, signal: AbortSignal) {
        yield { rpcId, payload: { type: 'session/subscribed' as const, sessionId: 'session-1', lastSeq: 0 } }
        yield { rpcId, payload: { type: 'approval/requested' as const, sessionId: 'session-1', approvalId: 'approval-1', toolName: 'read', reason: 'Needs permission' } }
        yield { rpcId, payload: { type: 'question/requested' as const, sessionId: 'session-1', questions: [{ id: 'question-1', question: 'Proceed?' }] } }
        await waitForAbort(signal)
      },
      host: async function* ({ rpcId }: { rpcId: RpcId }, signal: AbortSignal) {
        yield { rpcId, payload: { type: 'host/workspace-removed' as const, workspaceId: 'private-workspace' } }
        yield { rpcId, payload: { type: 'host/archived-sessions-changed' as const, archivedSessionIds: ['session-archived'] } }
        yield { rpcId, payload: { type: 'host/session-status' as const, sessionId: 'session-1', running: true } }
        await waitForAbort(signal)
      },
    },
  } as unknown as ApiProxy
  ctx.provide('apiProxy', api)
}

/** Boot the carrier from cordis.yml through the vendored Loader. */
async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-mobile-access-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-mobile-access'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "    advertiseHost: '127.0.0.1'",
    `    dshHome: ${JSON.stringify(root)}`,
    '    printPairingCode: false',
    "- name: 'fake-api'",
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-mobile-access', MobileAccess],
    ['fake-api', { apply: applyFakeApi }],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      const module = modules.get(specifier)
      if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return module
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  return context
}

/** Persistent text inbox so adjacent authentication and event frames cannot race the test listener. */
class TextInbox {
  private readonly queued: string[] = []
  private readonly waiting: ((value: string) => void)[] = []

  constructor(socket: WebSocket) {
    socket.on('message', (data: RawData, binary: boolean) => {
      if (binary) throw new Error('expected text frame')
      const value = Buffer.from(data as ArrayBuffer).toString('utf8')
      const waiter = this.waiting.shift()
      if (waiter === undefined) this.queued.push(value)
      else waiter(value)
    })
  }

  /** Return the oldest frame, waiting when the inbox is empty. */
  async next(): Promise<string> {
    const value = this.queued.shift()
    return value ?? await new Promise<string>(resolve => this.waiting.push(resolve))
  }
}

/** Decode the pairing offer printed by the bound service. */
function pairingOffer(url: string): { endpoint: string; deviceToken: string; publicKeyB64: string } {
  const code = new URL(url).searchParams.get('code')
  if (code === null) throw new Error('missing pairing code')
  return JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as {
    endpoint: string
    deviceToken: string
    publicKeyB64: string
  }
}

describe('mobile-access real composition', () => {
  it('authenticates before forwarding the narrow Session API and live events', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const offer = pairingOffer(loaded.mobileAccess.pairingUrl)
    const socket = new WebSocket(offer.endpoint)
    const inbox = new TextInbox(socket)
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })

    const client = generateKeyPair()
    const sharedKey = deriveSharedKey(decodeKey(client.secretKeyB64, 'client secret'), decodeKey(offer.publicKeyB64, 'host public'))
    socket.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: client.publicKeyB64 }))
    expect(JSON.parse(await inbox.next())).toEqual({ type: 'e2ee_ready' })
    socket.send(encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: offer.deviceToken }), sharedKey))

    const first = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { type?: string }
    expect(first).toEqual({ type: 'e2ee_authenticated' })
    const events = await Promise.all([inbox.next(), inbox.next(), inbox.next(), inbox.next(), inbox.next()])
    const methods = events.map(frame =>
      (JSON.parse(decrypt(frame, sharedKey) ?? 'null') as { method?: string }).method)
    expect(methods.sort()).toEqual([
      'approval/requested', 'host/archived-sessions-changed', 'host/session-status', 'question/requested', 'session/subscribed',
    ])

    socket.send(encrypt(JSON.stringify({ type: 'client-request', rpcId: 'list-1', method: 'session.list', payload: {} }), sharedKey))
    const list = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { result?: { value?: { items?: unknown[] } } }
    expect(list.result?.value?.items).toHaveLength(1)

    socket.send(encrypt(JSON.stringify({ type: 'client-request', rpcId: 'archive-1', method: 'mobile.archivedSessions', payload: {} }), sharedKey))
    const workspace = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as {
      result?: { value?: { archivedSessionIds?: unknown[] } }
    }
    expect(workspace.result?.value?.archivedSessionIds).toEqual(['session-archived'])

    socket.send(encrypt(JSON.stringify({ type: 'client-request', rpcId: 'workspace-1', method: 'workspace.list', payload: {} }), sharedKey))
    const workspaces = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as {
      result?: { value?: { items?: unknown[]; archivedSessionIds?: unknown[] } }
    }
    expect(workspaces.result?.value?.items).toEqual([])
    expect(workspaces.result?.value?.archivedSessionIds).toEqual(['session-archived'])

    socket.send(encrypt(JSON.stringify({
      type: 'client-request', rpcId: 'create-1', method: 'session.create', payload: { sessionId: 'session-requested', cwd: 'C:/workspace' },
    }), sharedKey))
    const created = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as {
      result?: { ok?: boolean; value?: { sessionId?: string } }
    }
    expect(created.result?.value?.sessionId).toBe('session-created')
    expect(createdSession).toEqual({ sessionId: 'session-requested', cwd: 'C:/workspace' })

    socket.send(encrypt(JSON.stringify({
      type: 'client-request', rpcId: 'models-1', method: 'session.models', payload: { sessionId: 'session-1' },
    }), sharedKey))
    const models = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as {
      result?: { value?: { current?: { model?: string } } }
    }
    expect(models.result?.value?.current?.model).toBe('deepseek-chat')

    socket.send(encrypt(JSON.stringify({
      type: 'client-request',
      rpcId: 'select-model-1',
      method: 'session.selectModel',
      payload: { sessionId: 'session-1', provider: 'deepseek', model: 'deepseek-reasoner' },
    }), sharedKey))
    const selection = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { result?: { ok?: boolean } }
    expect(selection.result?.ok).toBe(true)
    expect(selectedModel).toEqual({ sessionId: 'session-1', provider: 'deepseek', model: 'deepseek-reasoner' })

    socket.send(encrypt(JSON.stringify({
      type: 'client-request', rpcId: 'attachment-1', method: 'session.attachment',
      payload: { sessionId: 'session-1', attachmentId: 'sha256:one' },
    }), sharedKey))
    const attachment = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { result?: { value?: { data?: string } } }
    expect(attachment.result?.value?.data).toBe('AQ==')

    socket.send(encrypt(JSON.stringify({
      type: 'client-request',
      rpcId: 'prompt-1',
      method: 'session.prompt',
      payload: {
        sessionId: 'session-1',
        mode: 'queue',
        content: [
          { type: 'text', text: 'from phone' },
          { type: 'image', mediaType: 'image/png', data: 'AQ==', name: 'phone.png' },
        ],
      },
    }), sharedKey))
    const prompt = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { result?: { ok?: boolean } }
    expect(prompt.result?.ok).toBe(true)
    expect(prompted).toMatchObject({
      content: [
        { type: 'text', text: 'from phone' },
        { type: 'image', mediaType: 'image/png', data: 'AQ==', name: 'phone.png' },
      ],
    })

    failNextHistory = true
    socket.send(encrypt(JSON.stringify({
      type: 'client-request', rpcId: 'crash-guard-1', method: 'session.history', payload: { sessionId: 'session-1' },
    }), sharedKey))
    const failed = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { result?: { ok?: boolean; error?: { code?: string } } }
    expect(failed.result).toEqual({ ok: false, error: { code: 'internal', message: 'mobile request failed', details: {} } })

    socket.send(encrypt(JSON.stringify({ type: 'client-request', rpcId: 'crash-guard-2', method: 'session.models', payload: { sessionId: 'session-1' } }), sharedKey))
    const recovered = JSON.parse(decrypt(await inbox.next(), sharedKey) ?? 'null') as { result?: { ok?: boolean } }
    expect(recovered.result?.ok).toBe(true)

    socket.close()
    await loaded.fiber.dispose()
    context = undefined
  })

  it('rejects authentication with a token that was not paired', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const offer = pairingOffer(loaded.mobileAccess.pairingUrl)
    const socket = new WebSocket(offer.endpoint)
    const inbox = new TextInbox(socket)
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
    const client = generateKeyPair()
    const sharedKey = deriveSharedKey(decodeKey(client.secretKeyB64, 'client secret'), decodeKey(offer.publicKeyB64, 'host public'))
    socket.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: client.publicKeyB64 }))
    await inbox.next()
    socket.send(encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: 'wrong-token' }), sharedKey))
    const [code] = await new Promise<[number]>(resolve => socket.once('close', (value) => {
      resolve([value])
    }))
    expect(code).toBe(4001)
  })
})
