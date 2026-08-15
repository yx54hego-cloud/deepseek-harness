import { describe, expect, it } from 'vitest'
import { parsePairingInput, projectActivity, projectTranscript } from '../src/protocol'

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

  it('projects context, thinking, tool, and question events into the live process', () => {
    const activities = projectActivity([
      { type: 'turn/start', seq: 1, time: 10, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: 11, data: { source: { kind: 'plugin', plugin: 'AGENTS.md', form: 'instructions' }, content: [{ type: 'text', text: 'follow these instructions' }] } },
      { type: 'step/start', seq: 3, time: 12, data: { turn: 1, step: 1 } },
      { type: 'assistant/chunk', seq: 4, time: 13, data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'I will inspect the repo.' } } },
      { type: 'tool/call', seq: 5, time: 14, data: { turn: 1, step: 1, callId: 'call-1', name: 'read', arguments: '{"path":"README.md"}' } },
      { type: 'approval/asked', seq: 6, time: 15, data: { id: 'approval-1', toolName: 'read', reason: 'Needs permission' } },
      { type: 'approval/decided', seq: 7, time: 16, data: { id: 'approval-1', outcome: 'allowed-once' } },
      { type: 'tool/result', seq: 8, time: 17, data: { message: { source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: 'file contents' }] }] } } },
      { type: 'step/end', seq: 9, time: 18, data: { turn: 1, step: 1 } },
      { type: 'turn/end', seq: 10, time: 19, data: { turn: 1, reason: { kind: 'completed' } } },
    ])
    expect(activities).toEqual([
      { id: 'turn-1', kind: 'turn', title: 'Turn 1', status: 'done', time: 10, detail: 'completed' },
      { id: 'context-2', kind: 'context', title: 'Context · AGENTS.md', detail: 'follow these instructions', status: 'done', time: 11 },
      { id: 'step-1-1', kind: 'step', title: 'Step 1', status: 'done', time: 12 },
      { id: 'thinking-1-1', kind: 'thinking', title: 'Think', detail: 'I will inspect the repo.', status: 'done', time: 13 },
      { id: 'tool-call-1', kind: 'tool', title: 'Tool · read', detail: 'file contents', status: 'done', time: 14 },
      { id: 'question-approval-1', kind: 'question', title: 'Approval · read', detail: 'allowed-once', status: 'done', time: 15 },
    ])
  })
})
