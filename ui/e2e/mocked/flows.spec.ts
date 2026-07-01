import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test.beforeEach(async ({ page }) => {
  await installMockBackend(page)
})

test('welcome screen offers the join/host fork with the privacy line', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Your own AI. On your own machines.')).toBeVisible()
  await expect(page.getByTestId('welcome-join')).toBeVisible()
  await expect(page.getByTestId('welcome-host')).toBeVisible()
  await expect(
    page.getByText('Everything stays between your devices — end-to-end encrypted.'),
  ).toBeVisible()
})

test('host flow: scan → reveal → visibility → progress → mesh live with QR → main window', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('welcome-host').click()

  // The hardware scan beat
  await expect(page.getByText('Checking your Mac...')).toBeVisible()
  await expect(page.getByTestId('scan-chip')).toHaveText('Apple M5 Max', { timeout: 5000 })
  await expect(page.getByTestId('scan-ai-memory')).toHaveText('128 GB')

  // Reveal with recommendation card + fit badge
  await expect(page.getByTestId('recommendation-card')).toBeVisible({ timeout: 6000 })
  await expect(page.getByTestId('recommended-name')).toHaveText('Qwen3-Coder-Next-Q4_K_M')
  await expect(page.getByTestId('recommendation-card').getByTestId('fit-badge')).toHaveAttribute(
    'data-fit',
    'comfortable',
  )

  // Model options: too-large models are visible but disabled
  await page.getByTestId('see-options').click()
  await expect(page.getByTestId('model-row-MiniMax-M2.5-Q4_K_M')).toBeDisabled()
  await expect(page.getByTestId('model-row-MiniMax-M2.5-Q4_K_M')).toContainText('Needs about 138GB')
  await page.getByTestId('model-row-Qwen3-0.6B-Q4_K_M').click()
  await page.getByTestId('models-continue').click()

  // Visibility: invite-only preselected
  await expect(page.getByTestId('visibility-screen')).toBeVisible()
  await expect(page.getByText('Who can join your mesh?')).toBeVisible()
  await page.getByTestId('visibility-continue').click()

  // Progress: download percentage appears
  await expect(page.getByTestId('progress-screen')).toBeVisible()
  await expect(page.getByTestId('progress-stats')).toContainText('%', { timeout: 5000 })

  // Mesh live: QR + copy + footer
  await expect(page.getByTestId('mesh-live-screen')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Your mesh is live.')).toBeVisible()
  await expect(page.getByTestId('invite-qr').locator('svg')).toBeVisible()
  await page.getByTestId('copy-invite').click()
  await expect(page.getByTestId('copy-invite')).toHaveText('Copied ✓')

  // The host call carried the chosen model + visibility
  const hostCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { hostCalls: unknown[] } }).__mockState.hostCalls,
  )
  expect(hostCalls).toEqual([
    { model: 'Qwen3-0.6B-Q4_K_M', visibility: 'private', mesh_name: null },
  ])

  // Into the main window
  await page.getByTestId('go-to-chat').click()
  await expect(page.getByTestId('mesh-name')).toContainText("test-mac's mesh")
  await expect(page.getByTestId('mesh-status')).toContainText('Live · invite-only')
  await expect(page.getByTestId('people-list')).toContainText('This Mac')
  await expect(page.getByTestId('waiting-for-peers')).toBeVisible()
})

test('join flow validates the invite code and reaches the main window as chat-only', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('welcome-join').click()

  const input = page.getByTestId('invite-input')
  await input.fill('definitely not a token!!!')
  await expect(page.getByTestId('invite-invalid')).toBeVisible()
  await expect(page.getByTestId('invite-continue')).toBeDisabled()

  const goodToken = await page.evaluate(() =>
    btoa(JSON.stringify({ id: 'abc'.repeat(20), addrs: [{ Ip: '1.2.3.4:5' }] }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  )
  await input.fill(goodToken)
  await expect(page.getByTestId('invite-valid')).toBeVisible()
  await page.getByTestId('invite-continue').click()

  // Mode choice: pick "Just chat"
  await expect(page.getByText('How do you want to take part?')).toBeVisible()
  await page.getByTestId('mode-chat').click()
  await page.getByTestId('mode-continue').click()

  // Straight to main window once running (no MeshLive for joiners)
  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 10_000 })

  const joinCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls,
  )
  expect(joinCalls).toHaveLength(1)
  expect(joinCalls[0]).toMatchObject({ token: goodToken, share: false })
})

test('invite modal shows QR and copyable code from the main window', async ({ page }) => {
  // Boot directly into running state
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()
  await page.getByTestId('invite-button').click()
  await expect(page.getByTestId('invite-modal')).toBeVisible()
  await expect(page.getByTestId('invite-qr').locator('svg')).toBeVisible()
  await page.getByTestId('copy-invite').click()
  await expect(page.getByTestId('copy-invite')).toHaveText('Copied ✓')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('invite-modal')).not.toBeVisible()
})
