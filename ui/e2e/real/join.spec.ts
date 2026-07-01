import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { expect, test } from '@playwright/test'

/**
 * Two real machines in miniature: the primary backend hosts a mesh; this spec
 * spawns a SECOND mesh-consoled process, joins it to the first via the invite
 * token pasted into the real UI, and asserts the peer appears and chat routes
 * across the iroh tunnel to the host's model.
 */

const TINY_MODEL = 'Qwen3-0.6B-Q4_K_M'

let joiner: ChildProcess | null = null
let joinerUrl: string | null = null

test.afterAll(() => {
  joiner?.kill()
})

async function ensureHostRunning(baseURL: string): Promise<void> {
  const state = await (await fetch(`${baseURL}/app/state`)).json()
  if (state.phase === 'running') return
  if (state.phase === 'idle' || state.phase === 'error') {
    await fetch(`${baseURL}/app/host`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: TINY_MODEL, visibility: 'private', mesh_name: null }),
    })
  }
  await expect
    .poll(async () => (await (await fetch(`${baseURL}/app/state`)).json()).phase, {
      timeout: 360_000,
      intervals: [2000],
    })
    .toBe('running')
}

async function spawnJoiner(): Promise<string> {
  const bin = process.env.MESH_CONSOLED_BIN
  if (!bin) test.skip(true, 'MESH_CONSOLED_BIN not set (run via scripts/run-real-e2e.sh)')
  joiner = spawn(bin!, ['--app-port', '0', '--api-port', '0', '--console-port', '0'], {
    stdio: ['ignore', 'pipe', 'ignore'],
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
  await page.getByTestId('chat-input').fill('Say the word mesh.')
  await page.getByTestId('chat-send').click()

  const answer = page.getByTestId('assistant-message').last().getByTestId('assistant-text')
  await expect
    .poll(async () => ((await answer.textContent()) ?? '').length, { timeout: 120_000 })
    .toBeGreaterThan(3)
  console.log('joiner got:', ((await answer.textContent()) ?? '').slice(0, 120))
})
