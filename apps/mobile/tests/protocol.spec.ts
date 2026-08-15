import { describe, expect, it } from 'vitest'
import { parsePairingInput, projectTranscript } from '../src/protocol'

describe('mobile protocol projection', () => {
  it('accepts both the dsh pairing URL and its bare code', () => {
    const offer = { v: 1, endpoint: 'ws://192.168.1.8:6769', deviceId: crypto.randomUUID(), deviceToken: 'token', publicKeyB64: 'key' }
    const code = btoa(JSON.stringify(offer))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
    expect(parsePairingInput(`dsh://pair?code=${code}`)).toEqual(offer)
    expect(parsePairingInput(code)).toEqual(offer)
  })

  it('folds text messages and replaces a partial when the final assistant message arrives', () => {
    expect(projectTranscript([
      { type: 'user/message', seq: 1, time: 10, data: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'assistant/chunk', seq: 2, time: 20, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'hel' } } },
      { type: 'assistant/chunk', seq: 3, time: 21, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'lo' } } },
      { type: 'assistant/message', seq: 4, time: 22, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'hello!' }] } } },
      { type: 'user/message', seq: 5, time: 23, surfaceOp: 'replace', data: { content: [{ type: 'text', text: 'hidden summary' }] } },
    ])).toEqual([
      { id: 'event-1', role: 'user', text: 'hello', time: 10 },
      { id: 'event-4', role: 'assistant', text: 'hello!', time: 22 },
    ])
  })

  it('keeps durable image references as visible transcript rows', () => {
    expect(projectTranscript([
      {
        type: 'user/message', seq: 1, time: 10,
        data: { content: [{ type: 'image', attachment: { attachmentId: 'sha256:one', mediaType: 'image/png' } }] },
      },
    ])).toEqual([
      { id: 'event-1', role: 'user', text: '', time: 10, images: [{ attachmentId: 'sha256:one', mediaType: 'image/png' }] },
    ])
  })
})
