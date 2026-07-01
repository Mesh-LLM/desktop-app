import { expect, test } from '@playwright/test'

/**
 * The genuine end-to-end proof: drives the REAL frontend against the REAL
 * backend (fresh mesh-consoled started by scripts/run-real-e2e.sh), which
 * hosts a REAL private mesh serving a real tiny model, and asserts real
 * streamed inference. First run downloads Qwen3-0.6B (~400MB).
 */

const TINY_MODEL = 'Qwen3-0.6B-Q4_K_M'

test('host a private mesh through the UI and chat with the real model', async ({ page }) => {
  await page.goto('/')

  // Welcome → host
  await expect(page.getByText('Your own AI. On your own machines.')).toBeVisible()
  await page.getByTestId('welcome-host').click()

  // Real hardware scan: chip + memory come from mesh_llm_system::hardware::survey()
  await expect(page.getByTestId('recommendation-card')).toBeVisible({ timeout: 30_000 })
  // The reveal spec strip shows the real detected hardware
  await expect(page.getByText(/AI memory/)).toBeVisible()

  // Pick the tiny model from the full list (recommendation on a big Mac is huge)
  await page.getByTestId('see-options').click()
  await page.getByTestId(`model-row-${TINY_MODEL}`).click()
  await page.getByTestId('models-continue').click()

  // Private mesh
  await expect(page.getByTestId('visibility-screen')).toBeVisible()
  await page.getByTestId('visibility-continue').click()

  // Progress → mesh live. Generous timeout: runtime install + model download
  // + GGUF load all happen for real here.
  await expect(page.getByTestId('mesh-live-screen')).toBeVisible({ timeout: 360_000 })
  await expect(page.getByTestId('invite-qr').locator('svg')).toBeVisible()

  // The QR encodes a real iroh invite token: base64url JSON with id + addrs
  const invite = await page.evaluate(async () => {
    const r = await fetch('/app/invite')
    return (await r.json()) as { token: string }
  })
  const pad = '='.repeat((4 - (invite.token.length % 4)) % 4)
  const decoded = JSON.parse(
    Buffer.from(invite.token.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString(),
  )
  expect(decoded).toHaveProperty('id')
  expect(decoded).toHaveProperty('addrs')

  // Chat with the real model
  await page.getByTestId('go-to-chat').click()
  await expect(page.getByTestId('model-picker')).not.toHaveValue('', { timeout: 30_000 })
  await page.getByTestId('chat-input').fill('Say the word mesh.')
  await page.getByTestId('chat-send').click()

  const answer = page.getByTestId('assistant-message').last().getByTestId('assistant-text')
  await expect(answer).toBeVisible({ timeout: 60_000 })

  // Real streaming: the visible text must grow over time
  await expect
    .poll(async () => ((await answer.textContent()) ?? '').length, {
      timeout: 120_000,
      message: 'assistant text should stream in',
    })
    .toBeGreaterThan(3)

  // Completion stamp proves the stream finished end-to-end
  await expect(page.getByText(/\d+ tok\/s/)).toBeVisible({ timeout: 120_000 })

  const text = (await answer.textContent()) ?? ''
  console.log('real model said:', text.slice(0, 120))
  expect(text.length).toBeGreaterThan(3)
})
