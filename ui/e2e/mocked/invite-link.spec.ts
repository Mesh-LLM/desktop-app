import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

// A syntactically valid invite token (base64url JSON), long enough to pass
// looksLikeInviteToken's shape check.
const LINK_TOKEN =
  'eyJpZCI6Imxpbmstbm9kZS1pZC0wMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJhZGRycyI6W3siSXAiOiIxMC4wLjAuNzo1MDAwMCJ9XX0'

test('a mesh:// invite link that launched the app opens the join flow prefilled', async ({
  page,
}) => {
  await installMockBackend(page, { pendingInvite: LINK_TOKEN })
  await page.goto('/')

  // Straight into the join flow with the token already pasted and validated.
  await expect(page.getByTestId('invite-input')).toHaveValue(LINK_TOKEN)
  await expect(page.getByTestId('invite-valid')).toBeVisible()
  await expect(page.getByTestId('invite-continue')).toBeEnabled()
})

test('an invite link clicked while the app is open jumps to the join flow', async ({ page }) => {
  await installMockBackend(page)
  await page.goto('/')
  await expect(page.getByTestId('welcome-join')).toBeVisible()

  // The backend broadcasts invite_link when the OS hands it a mesh:// URL.
  await page.evaluate((token) => {
    ;(window as unknown as { __emitApp: (obj: Record<string, unknown>) => void }).__emitApp({
      type: 'node_event',
      event: 'invite_link',
      detail: { token },
    })
  }, LINK_TOKEN)

  await expect(page.getByTestId('invite-input')).toHaveValue(LINK_TOKEN)
  await expect(page.getByTestId('invite-valid')).toBeVisible()
})

test('the invite modal offers a one-click shareable link', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()

  await page.getByTestId('invite-button').click()
  await expect(page.getByTestId('invite-modal')).toBeVisible()
  await expect(page.getByTestId('copy-invite-link')).toBeVisible()
  await page.getByTestId('copy-invite-link').click()
  await expect(page.getByTestId('copy-invite-link')).toHaveText('Copied')

  // The copied link is the landing page with the token in the fragment.
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toMatch(/^https:\/\/mesh-llm\.github\.io\/desktop-app\/join\/#/)
  expect(clipboard.split('#')[1].length).toBeGreaterThan(40)
})
