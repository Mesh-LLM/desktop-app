import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test.beforeEach(async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()
})

test('chat streams a reply with thinking folded away and a tok/s stamp', async ({ page }) => {
  // Model picker defaults to the smart virtual ref: solo/private mesh → "auto"
  // (mesh routes to best fit; MoA "mesh" needs ≥2 models). The real model is
  // still listed for explicit pinning.
  await expect(page.getByTestId('model-picker')).toHaveValue('auto')
  await expect(
    page.getByTestId('model-picker').locator('option[value="unsloth/Qwen3-0.6B-GGUF:Q4_K_M"]'),
  ).toHaveCount(1)

  // Empty state with starter chips
  await expect(page.getByText('Say hello.')).toBeVisible()

  const input = page.getByTestId('chat-input')
  await input.fill('Say hello from the mesh')
  await page.getByTestId('chat-send').click()

  const assistant = page.getByTestId('assistant-message')
  await expect(assistant).toBeVisible()

  // Before the first token arrives the bubble shows the shimmering
  // "thinking…" placeholder instead of dead air; it clears once content lands.
  await expect(assistant.getByTestId('assistant-waiting')).toBeVisible()
  await expect(assistant.getByTestId('assistant-waiting')).not.toBeVisible({ timeout: 10_000 })

  // The <think> block folds into a toggle instead of polluting the answer
  await expect(assistant.getByTestId('thinking-toggle')).toBeVisible()
  await expect(assistant.getByTestId('assistant-text')).toContainText('Hello from the mesh.', {
    timeout: 10_000,
  })
  await expect(assistant.getByTestId('assistant-text')).not.toContainText('pondering')

  // Expanding the thinking strip reveals it
  await assistant.getByTestId('thinking-toggle').click()
  await expect(assistant.getByText('pondering the mesh')).toBeVisible()

  // Completion stamps speed (client-side timing fallback — value varies)
  await expect(assistant).toContainText(/\d+ tok\/s/)

  // The agent owns history: the request carries only the new message
  const chatCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { chatCalls: unknown[] } }).__mockState.chatCalls,
  )
  expect(chatCalls).toEqual([
    { model: 'auto', text: 'Say hello from the mesh' },
  ])
})

test('agent tool activity shows as a chip that completes', async ({ page }) => {
  const input = page.getByTestId('chat-input')
  await input.fill('Fetch me something from the web')
  await page.getByTestId('chat-send').click()

  const assistant = page.getByTestId('assistant-message')
  const chip = assistant.getByTestId('tool-chip')

  // The chip surfaces the tool (goose's extension__tool prefix stripped)…
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('web_scrape')

  // …and settles to done when the tool result arrives, with the answer intact.
  await expect(chip).toHaveAttribute('data-status', 'done')
  await expect(assistant.getByTestId('assistant-text')).toContainText('Hello from the mesh.', {
    timeout: 10_000,
  })
})

test('send disables on empty input and Enter submits', async ({ page }) => {
  const send = page.getByTestId('chat-send')
  await expect(send).toBeDisabled()
  const input = page.getByTestId('chat-input')
  await input.fill('hi')
  await expect(send).toBeEnabled()
  await input.press('Enter')
  await expect(page.getByTestId('assistant-message')).toBeVisible()
})
