import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test.beforeEach(async ({ page }) => {
  await installMockBackend(page)
})

test('welcome screen heroes the global mesh with the private options below', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Your own AI. On your own machines.')).toBeVisible()
  await expect(page.getByTestId('welcome-public')).toBeVisible()
  await expect(page.getByTestId('welcome-public')).toContainText('global mesh')
  await expect(page.getByTestId('welcome-join')).toBeVisible()
  await expect(page.getByTestId('welcome-host')).toBeVisible()
  await expect(
    page.getByText('Everything stays between your devices — end-to-end encrypted.'),
  ).toBeVisible()
})

test('global mesh: "just connect" joins as a public passive client', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('welcome-public').click()
  await expect(page.getByTestId('public-join-screen')).toBeVisible()
  // "Just connect" is preselected — continue straight through.
  await page.getByTestId('public-continue').click()

  // The public-flavored load screen: connection copy, no download language.
  await expect(page.getByTestId('public-progress-screen')).toBeVisible()
  await expect(page.getByTestId('public-progress-screen')).toHaveAttribute(
    'data-flavor',
    'public-passive',
  )
  await expect(page.getByTestId('stage-download')).toHaveCount(0)
  await expect(page.getByTestId('stage-reach')).toBeVisible()

  // Rests at "ready to chat" (with the share offer) instead of auto-jumping.
  await expect(page.getByTestId('start-chatting')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('public-upgrade-card')).toBeVisible()
  await page.getByTestId('start-chatting').click()

  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('mesh-name')).toContainText('Global mesh')
  await expect(page.getByTestId('mesh-status')).toContainText('open')

  const joinCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls,
  )
  expect(joinCalls).toHaveLength(1)
  expect(joinCalls[0]).toMatchObject({ public: true, share: false })
})

test('global mesh: passive client upgrades to sharing this Mac’s compute', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('welcome-public').click()
  await page.getByTestId('public-continue').click()

  // Once connected, offer to also share this Mac's compute. You share compute,
  // not a specific model — the choice routes through the hardware check, which
  // picks the best-fit model for the machine.
  await expect(page.getByTestId('start-chatting')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('public-share-compute').click()

  // The hardware check runs and recommends the best-fit model for this Mac;
  // accept it.
  await expect(page.getByTestId('reveal-screen')).toBeVisible({ timeout: 6000 })
  await page.getByTestId('use-model').click()

  // The upgrade is a shutdown + rejoin with share:true…
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mockState: { shutdownCalls: unknown[] } }).__mockState
            .shutdownCalls.length,
      ),
    )
    .toBe(1)
  // …whose download runs on the contributor-flavored screen…
  await expect(page.getByTestId('public-progress-screen')).toHaveAttribute(
    'data-flavor',
    'public-share',
    { timeout: 10_000 },
  )
  // …and lands in the chat once serving.
  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 15_000 })

  const joinCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls,
  )
  expect(joinCalls).toHaveLength(2)
  expect(joinCalls[1]).toMatchObject({
    public: true,
    share: true,
    model: 'Qwen3-Coder-Next-Q4_K_M',
  })
})

test('main window offers "start sharing" to a public chat-only client', async ({ page }) => {
  await installMockBackend(page, {
    startRunning: true,
    runningPhase: {
      mode: 'join',
      visibility: 'public',
      serving: false,
      model: null,
      mesh_name: 'Global mesh',
    },
    installedInDiagnose: true,
  })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toContainText('Global mesh')

  // The chat-only note is an action on the global mesh.
  await page.getByTestId('start-sharing').click()

  // Into the model picker (installed fast path), then the upgrade fires.
  await expect(page.getByTestId('installed-screen')).toBeVisible({ timeout: 6000 })
  await page.getByTestId('installed-row-Qwen3-0.6B-Q4_K_M').click()
  await page.getByTestId('use-installed').click()

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mockState: { shutdownCalls: unknown[] } }).__mockState
            .shutdownCalls.length,
      ),
    )
    .toBe(1)
  // The rejoin fires right after the shutdown resolves — wait for it.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls
            .length,
      ),
    )
    .toBe(1)
  const joinCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls,
  )
  expect(joinCalls[0]).toMatchObject({
    public: true,
    share: true,
    model: 'Qwen3-0.6B-Q4_K_M',
  })
})

test('global mesh: "run a model" routes through the hardware check, then contributes', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('welcome-public').click()
  await page.getByTestId('public-mode-contribute').click()
  await page.getByTestId('public-continue').click()

  // Same hardware scan beat as starting a private mesh — now with real disk.
  await expect(page.getByText('Checking your Mac...')).toBeVisible()
  await expect(page.getByTestId('scan-free-disk')).toHaveText('812 GB', { timeout: 5000 })
  await expect(page.getByTestId('recommendation-card')).toBeVisible({ timeout: 6000 })
  await page.getByTestId('use-model').click()

  // Contributor download runs on the public-flavored screen (global-mesh copy).
  await expect(page.getByTestId('public-progress-screen')).toHaveAttribute(
    'data-flavor',
    'public-share',
  )
  await expect(page.getByTestId('stage-connect')).toBeVisible()

  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 10_000 })
  const joinCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls,
  )
  expect(joinCalls[0]).toMatchObject({
    public: true,
    share: true,
    model: 'Qwen3-Coder-Next-Q4_K_M',
  })
})

test('setup skips the scan when a model is already downloaded', async ({ page }) => {
  await installMockBackend(page, { installedInDiagnose: true })
  await page.goto('/')
  await page.getByTestId('welcome-host').click()

  // Straight to the installed picker — no "Checking your Mac…" beat.
  await expect(page.getByTestId('installed-screen')).toBeVisible({ timeout: 6000 })
  await expect(page.getByTestId('installed-row-Qwen3-0.6B-Q4_K_M')).toBeVisible()

  // …but the full hardware check is one click away for swapping.
  await page.getByTestId('rerun-diagnostic').click()
  await expect(page.getByText('Checking your Mac...')).toBeVisible()
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

  // Progress: staged checklist + download percentage, rate and ETA appear
  await expect(page.getByTestId('progress-screen')).toBeVisible()
  await expect(page.getByTestId('stage-download')).toHaveAttribute('data-state', 'active', {
    timeout: 5000,
  })
  await expect(page.getByTestId('stage-engine')).toHaveAttribute('data-state', 'done')
  await expect(page.getByTestId('progress-stats')).toContainText('%', { timeout: 5000 })
  await expect(page.getByTestId('progress-stats')).toContainText('/s', { timeout: 5000 })
  await expect(page.getByTestId('progress-stats')).toContainText('left')

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

test('remembers the last mesh and offers "Back to mesh" on a fresh open', async ({ page }) => {
  // Launch the global mesh as a passive client, reaching the main window.
  await page.goto('/')
  await page.getByTestId('welcome-public').click()
  await page.getByTestId('public-continue').click()
  await expect(page.getByTestId('start-chatting')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('start-chatting').click()
  await expect(page.getByTestId('mesh-name')).toBeVisible({ timeout: 10_000 })

  // Reload: the mock backend boots Idle again (in-memory), so we land on
  // Welcome — but the remembered config surfaces a "Back to mesh" banner.
  await page.reload()
  await expect(page.getByTestId('resume-banner')).toBeVisible()
  await expect(page.getByTestId('resume-mesh')).toContainText('global mesh')

  // One click re-launches the same passive public join.
  await page.getByTestId('resume-mesh').click()
  await expect(page.getByTestId('start-chatting')).toBeVisible({ timeout: 10_000 })
  const joinCalls = await page.evaluate(
    () => (window as unknown as { __mockState: { joinCalls: unknown[] } }).__mockState.joinCalls,
  )
  expect(joinCalls[joinCalls.length - 1]).toMatchObject({ public: true, share: false })
})

test('"Start fresh" forgets the remembered mesh so the banner stays gone', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('welcome-public').click()
  await page.getByTestId('public-continue').click()
  await expect(page.getByTestId('start-chatting')).toBeVisible({ timeout: 10_000 })

  await page.reload()
  await expect(page.getByTestId('resume-banner')).toBeVisible()
  await page.getByTestId('resume-dismiss').click()
  await expect(page.getByTestId('resume-banner')).toHaveCount(0)

  // Still gone after another reload — the config was cleared, not just hidden.
  await page.reload()
  await expect(page.getByTestId('welcome-public')).toBeVisible()
  await expect(page.getByTestId('resume-banner')).toHaveCount(0)
})

test('appearance setting flips to light mode and persists across reload', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()

  await page.getByTestId('settings-button').click()
  await expect(page.getByTestId('theme-picker')).toBeVisible()
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).toHaveClass(/light/)
  expect(await page.evaluate(() => localStorage.getItem('mesh-theme'))).toBe('light')

  await page.reload()
  await expect(page.getByTestId('mesh-name')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/light/)

  // Back to dark — the shipped default.
  await page.getByTestId('settings-button').click()
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
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
