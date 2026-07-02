import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { ensureHostRunning } from './support'

/**
 * Two real machines in miniature: the primary backend hosts a mesh; this spec
 * spawns a SECOND mesh-consoled process, joins it to the first via the invite
 * token pasted into the real UI, and asserts the peer appears and chat routes
 * across the iroh tunnel to the host's model.
 */

let joiner: ChildProcess | null = null
let joinerUrl: string | null = null

test.afterAll(() => {
  joiner?.kill()
})

async function spawnJoiner(): Promise<string> {
  const bin = process.env.MESH_CONSOLED_BIN
  if (!bin) test.skip(true, 'MESH_CONSOLED_BIN not set (run via scripts/run-real-e2e.sh)')
  joiner = spawn(bin!, ['--app-port', '0', '--api-port', '0', '--console-port', '0'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    // Each daemon gets its own goose state dir — sharing one risks
    // session-store contention between the two processes.
    env: { ...process.env, GOOSE_PATH_ROOT: mkdtempSync(join(tmpdir(), 'goose-joiner-')) },
  })
  const [chunk] = (await once(joiner.stdout!, 'data')) as [Buffer]
  const handshake = JSON.parse(chunk.toString().split('\n')[0])
  return handshake.url as string
}

test('a second instance joins via the invite token and chats over the mesh', async ({
  page,
  baseURL,
}) => {
  await ensureHostRunning(baseURL!)
  const invite = await (await fetch(`${baseURL}/app/invite`)).json()
  expect(invite.token.length).toBeGreaterThan(100)

  joinerUrl = await spawnJoiner()
  console.log('joiner backend at', joinerUrl)

  // Drive the JOINER's UI in the browser
  await page.goto(joinerUrl!)
  await page.getByTestId('welcome-join').click()
  await page.getByTestId('invite-input').fill(invite.token)
  await expect(page.getByTestId('invite-valid')).toBeVisible()
  await page.getByTestId('invite-continue').click()

  // Chat-only join: fastest path, no model download
  await page.getByTestId('mode-chat').click()
  await page.getByTestId('mode-continue').click()

  // Main window once connected
  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 180_000 })

  // The host appears in the joiner's people list
  await expect(page.getByTestId('people-list')).toContainText('This Mac')
  await expect
    .poll(
      async () => {
        const status = await (await fetch(`${joinerUrl}/api/status`)).json()
        return (status.peers ?? []).length
      },
      { timeout: 120_000, intervals: [2000] },
    )
    .toBeGreaterThan(0)

  // Chat from the joiner routes over iroh to the host's model
  await expect(page.getByTestId('model-picker')).not.toHaveValue('', { timeout: 60_000 })
  await page
    .getByTestId('chat-input')
    .fill('Reply with the single word: mesh. Do not use any tools.')
  await page.getByTestId('chat-send').click()

  // The property under test is that tokens stream back from the HOST's model
  // over iroh. The tiny model may spend them on visible text, on <think>
  // reasoning (folded away), or on a tool call — any of those proves routing.
  const bubble = page.getByTestId('assistant-message').last()
  await expect
    .poll(
      async () => {
        const text = (await bubble.getByTestId('assistant-text').textContent()) ?? ''
        if (text.trim().length > 3) return 'text'
        if (await bubble.getByTestId('thinking-toggle').isVisible()) return 'thinking'
        if (await bubble.getByTestId('tool-chip').first().isVisible()) return 'tool'
        return ''
      },
      { timeout: 180_000, intervals: [2000] },
    )
    .not.toBe('')
  const answer = bubble.getByTestId('assistant-text')
  console.log('joiner got:', ((await answer.textContent()) ?? '').slice(0, 120))
})
