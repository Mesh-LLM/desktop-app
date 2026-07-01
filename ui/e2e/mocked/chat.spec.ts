import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test.beforeEach(async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()
})

test('chat streams a reply with thinking folded away and a tok/s stamp', async ({ page }) => {
  // Model picker populated from /v1/models
  await expect(page.getByTestId('model-picker')).toHaveValue('unsloth/Qwen3-0.6B-GGUF:Q4_K_M')

  // Empty state with starter chips
  await expect(page.getByText('Say hello.')).toBeVisible()

  const input = page.getByTestId('chat-input')
  await input.fill('Say hello from the mesh')
  await page.getByTestId('chat-send').click()

  const assistant = page.getByTestId('assistant-message')
  await expect(assistant).toBeVisible()

  // The <think> block folds into a toggle instead of polluting the answer
  await expect(assistant.getByTestId('thinking-toggle')).toBeVisible()
  await expect(assistant.getByTestId('assistant-text')).toContainText('Hello from the mesh.', {
    timeout: 10_000,
  })
  await expect(assistant.getByTestId('assistant-text')).not.toContainText('pondering')

  // Expanding the thinking strip reveals it
  await assistant.getByTestId('thinking-toggle').click()
  await expect(assistant.getByText('pondering the mesh')).toBeVisible()

  // Completion stamps attribution + speed
  await expect(assistant).toContainText('via this Mac')
  await expect(assistant).toContainText('40 tok/s')
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
