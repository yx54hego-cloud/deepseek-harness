/** Keyless human-visible transcript snapshot for the runnable mobile app. */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { projectTranscript } from '../src/protocol'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'snapshots/text-conversation')
const sessionPath = join(fixtureDir, 'session.jsonl')
const expectedPath = join(fixtureDir, 'transcript.expected.md')

describe('mobile conversation snapshot', () => {
  it('projects a persisted Session into the phone transcript', async () => {
    const rows = (await readFile(sessionPath, 'utf8')).trim().split('\n')
    const events = rows.slice(1).map(row => JSON.parse(row) as unknown) as Parameters<typeof projectTranscript>[0]
    const messages = projectTranscript(events)
    const actual = [
      '# Mobile conversation snapshot',
      '',
      ...messages.flatMap(message => [
        `**${message.role === 'user' ? 'User' : 'Assistant'}**`,
        '',
        message.text,
        '',
      ]),
    ].join('\n')

    if (process.env.DSH_SNAPSHOT === 'refresh') await writeFile(expectedPath, actual)
    expect(actual).toBe(await readFile(expectedPath, 'utf8'))
  })
})
