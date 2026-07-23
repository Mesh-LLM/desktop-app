import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { restartHostFresh } from './support'

/**
 * Real proof of the AGENT loop (not just inference): the goose agent must
 * pick up the web_scrape tool, fetch a page from a local fixture server this
 * spec runs, and finish the turn — all driven through the real UI.
 *
 * The fixture hit is the deterministic assertion that the tool really ran.
 * Whether the model can also *relay* the fetched secret in its answer is a
 * model-quality property — asserted softly for the tiny default model, so a
 * weak paraphrase doesn't fail the app-level test. Set MESH_TOOL_TEST_MODEL
 * to a stronger model to make that check meaningful.
 *
 * NOTE: file is named to sort after join.spec.ts — host-chat.spec.ts needs a
 * fresh daemon (Welcome screen), and specs run alphabetically with workers=1.
 */

const SECRET = 'kumquat'

let fixture: Server
let fixtureUrl = ''
let fixtureHits = 0

test.beforeAll(async () => {
  fixture = createServer((req, res) => {
    if (req.url === '/fact.txt') {
      fixtureHits++
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`The secret word is ${SECRET}.\n`)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve))
  const { port } = fixture.address() as AddressInfo
  fixtureUrl = `http://127.0.0.1:${port}/fact.txt`
})

test.afterAll(() => {
  fixture?.close()
})

// Prompts per attempt, escalating in force. Deliberately no example of the
// secret sentence: a literal "the secret word is X" in the prompt once let
// the model answer "X" without touching any tool.
const prompts = (url: string) => [
  `Use the web_scrape tool to fetch ${url} and tell me the secret word from it.`,
  `You must call the web_scrape tool with url ${url} before answering. Call it now.`,
  `Call the computercontroller__web_scrape tool with {"url": "${url}", "save_as": "text"}. Do not answer without calling it.`,
]

test('the agent fetches a local page with web_scrape and completes the turn', async ({
  page,
  baseURL,
}) => {
  // Three send attempts with a tiny nondeterministic model need more than
  // the project default.
  test.setTimeout(600_000)

  // Fresh mesh ⇒ fresh goose session: earlier specs' chat history must not
  // steer this turn (a polluted session made the model skip tools entirely).
  await restartHostFresh(baseURL!)

  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Auto routing')).toBeVisible({ timeout: 60_000 })

  // Desktop chat intentionally always uses auto routing.
  const model = process.env.MESH_TOOL_TEST_MODEL

  // Send each prompt in turn until a web_scrape chip shows up in that turn's
  // bubble. A turn without a tool call ends with the send button returning
  // (streaming over) — that's the cue to nudge again.
  let assistant = page.getByTestId('assistant-message').last()
  let chip = assistant.getByTestId('tool-chip')
  let calledTool = false
  for (const prompt of prompts(fixtureUrl)) {
    await expect(page.getByTestId('chat-send')).toBeVisible({ timeout: 120_000 })
    await page.getByTestId('chat-input').fill(prompt)
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-stop')).toBeVisible({ timeout: 30_000 })

    assistant = page.getByTestId('assistant-message').last()
    chip = assistant.getByTestId('tool-chip').filter({ hasText: 'web_scrape' }).first()
    // Each branch handles its own timeout so the race's loser never leaves an
    // unhandled rejection behind.
    const chipSeen = chip
      .waitFor({ state: 'visible', timeout: 150_000 })
      .then(() => 'chip' as const)
      .catch(() => 'timeout' as const)
    const turnEnd = page
      .getByTestId('chat-send')
      .waitFor({ state: 'visible', timeout: 150_000 })
      .then(() => 'no-tool' as const)
      .catch(() => 'timeout' as const)
    const outcome = await Promise.race([chipSeen, turnEnd])
    // A turn can finish so fast that "send is back" wins the race even though
    // a chip did render — check once more before nudging.
    if (outcome === 'chip' || (await chip.isVisible())) {
      calledTool = true
      break
    }
    console.log(`attempt did not tool-call (outcome: ${outcome}), nudging again`)
  }
  expect(calledTool, 'agent should call web_scrape within three prompts').toBe(true)

  // …the fixture actually got fetched (deterministic proof the tool ran)…
  await expect
    .poll(() => fixtureHits, { timeout: 120_000, message: 'fixture server should be hit' })
    .toBeGreaterThan(0)

  // …the tool finished rather than hanging or erroring…
  await expect(chip).toHaveAttribute('data-status', 'done', { timeout: 120_000 })

  // …and the turn completes with a finished stream (tok/s stamp).
  await expect(assistant.getByText(/\d+ tok\/s/)).toBeVisible({ timeout: 240_000 })

  const text = (await assistant.getByTestId('assistant-text').textContent()) ?? ''
  console.log('agent answered:', text.slice(0, 200))
  console.log(`secret relayed: ${text.toLowerCase().includes(SECRET)}`)
  // Relaying the secret is a model-quality property: hard-require it only
  // when a capable model was explicitly chosen; the tiny default often
  // paraphrases instead, which must not fail the app-level test.
  if (model) {
    expect(text.toLowerCase()).toContain(SECRET)
  }
})
