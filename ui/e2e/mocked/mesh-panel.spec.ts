import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test('mesh lives on the right, separates hosts and participants, and collapses', async ({
  page,
}) => {
  await installMockBackend(page, {
    startRunning: true,
    peers: [
      {
        id: 'host-fast',
        hostname: 'studio-host',
        serving_models: ['org/large-reasoning-model'],
        vram_gb: 64,
        latency_ms: 12,
      },
      {
        id: 'client-one',
        hostname: 'living-room',
        serving_models: [],
        latency_ms: 82,
      },
    ],
  })
  await page.goto('/')

  const chats = page.getByTestId('chat-sidebar')
  const mesh = page.getByTestId('mesh-panel')
  await expect(chats).toBeVisible()
  await expect(mesh).toBeVisible()
  expect(await chats.boundingBox()).not.toBeNull()
  expect(await mesh.boundingBox()).not.toBeNull()
  expect((await chats.boundingBox())!.x).toBeLessThan((await mesh.boundingBox())!.x)

  await expect(page.getByTestId('hosts-list')).toContainText('studio-host')
  await expect(page.getByTestId('participants-list')).toContainText('living-room')

  await page.getByRole('button', { name: 'Low latency' }).click()
  await expect(page.getByTestId('hosts-list')).toContainText('studio-host')
  await expect(page.getByTestId('participants-list')).not.toContainText('living-room')

  await page.getByTestId('mesh-collapse').click()
  await expect(mesh).toHaveCount(0)
  await page.getByTestId('mesh-expand').click()
  await expect(page.getByTestId('mesh-panel')).toBeVisible()
})
