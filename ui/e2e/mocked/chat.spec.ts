import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test.beforeEach(async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()
})

test('chat streams a reply with thinking folded away and a tok/s stamp', async ({ page }) => {
  // Routing is automatic; concrete model pinning is intentionally absent.
  await expect(page.getByText('Auto routing', { exact: true })).toBeVisible()
  await expect(page.getByTestId('model-picker')).toHaveCount(0)

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
    { model: 'auto', text: 'Say hello from the mesh', session_id: 'mock-session-1' },
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

// These override the shared beforeEach's mock with a history-seeded one, so
// re-run installMockBackend before navigating.
test('restores the ongoing conversation on launch (persistent session)', async ({ page }) => {
  await installMockBackend(page, {
    startRunning: true,
    history: [
      { id: 'h1', role: 'user', text: 'what did we name the project?' },
      { id: 'h2', role: 'assistant', text: 'We called it mesh-console.' },
    ],
  })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()

  // The prior turns repaint instead of the "Say hello." empty state.
  await expect(page.getByText('Say hello.')).toHaveCount(0)
  await expect(page.getByTestId('user-message')).toContainText('what did we name the project?')
  await expect(page.getByTestId('assistant-text')).toContainText('We called it mesh-console.')
})

test('"New chat" starts a new local session and keeps the previous chat listed', async ({
  page,
}) => {
  await installMockBackend(page, {
    startRunning: true,
    history: [
      { id: 'h1', role: 'user', text: 'remember this' },
      { id: 'h2', role: 'assistant', text: 'noted.' },
    ],
  })
  await page.goto('/')
  await expect(page.getByTestId('user-message')).toContainText('remember this')

  // The old Goose session remains in the left rail; a fresh session becomes active.
  await page.getByTestId('chat-new').click()
  await expect(page.getByText('Say hello.')).toBeVisible()
  await expect(page.getByTestId('user-message')).toHaveCount(0)
  await expect(page.getByTestId('chat-session')).toHaveCount(1)
  await expect(page.getByTestId('chat-draft')).toHaveCount(1)
  await expect(page.getByTestId('chat-session').filter({ hasText: 'remember this' })).toBeVisible()
})

// Regression for #7: GFM markdown (tables etc.) must render as real HTML, not
// raw pipe-delimited text. Needs remark-gfm + prose-mesh table styling.
test('renders a markdown table as a real table, not raw pipes', async ({ page }) => {
  await installMockBackend(page, {
    startRunning: true,
    history: [
      { id: 'h1', role: 'user', text: 'plan a week of dinners' },
      {
        id: 'h2',
        role: 'assistant',
        text: '| Day | Dinner |\n|-----|--------|\n| Mon | Tacos |\n| Tue | Pasta |',
      },
    ],
  })
  await page.goto('/')
  await expect(page.getByTestId('mesh-name')).toBeVisible()

  const answer = page.getByTestId('assistant-text')
  // Rendered as a real table with the right cells…
  await expect(answer.locator('table')).toBeVisible()
  await expect(answer.locator('th', { hasText: 'Day' })).toBeVisible()
  await expect(answer.locator('td', { hasText: 'Tacos' })).toBeVisible()
  // …and the raw markdown separator row is gone.
  await expect(answer).not.toContainText('|-----|')
})

test('a chat can be archived to history and restored', async ({ page }) => {
  await installMockBackend(page, {
    startRunning: true,
    history: [
      { id: 'h1', role: 'user', text: 'archive this conversation' },
      { id: 'h2', role: 'assistant', text: 'okay' },
    ],
  })
  await page.goto('/')
  const chat = page.getByTestId('chat-session').first()
  await chat.click({ button: 'right' })
  await expect(page.getByTestId('chat-session')).toHaveCount(0)
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('settings-chat-restore')).toBeVisible()
  await page.getByTestId('settings-chat-restore').click()
  await expect(page.getByTestId('settings-chat-restore')).toHaveCount(0)
})

test('empty new chats remain one disposable draft until prompted', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await expect(page.getByTestId('chat-draft')).toHaveCount(1)
  await expect(page.getByTestId('chat-session')).toHaveCount(0)
  await page.getByTestId('chat-new').click()
  await page.getByTestId('chat-new').click()
  await expect(page.getByTestId('chat-draft')).toHaveCount(1)
  await expect(page.getByTestId('chat-session')).toHaveCount(0)
})
