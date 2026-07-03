import { defineConfig, devices } from '@playwright/test'

const PREVIEW_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4620)
// The real project drives a prebuilt mesh-consoled backend (see e2e/real).
const REAL_URL = process.env.MESH_REAL_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1100, height: 720 },
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'on-first-retry',
    // Never let a single locator wait consume the whole test budget.
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'mocked',
      testDir: './e2e/mocked',
      use: { baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
    },
    {
      name: 'real',
      testDir: './e2e/real',
      timeout: 420_000,
      workers: 1,
      use: { baseURL: REAL_URL ?? 'http://127.0.0.1:4640' },
    },
  ],
  webServer: {
    // --host 127.0.0.1 so vite preview binds the loopback interface the
    // health-check (url below) polls; without it vite binds only localhost
    // (IPv6 ::1) and the 127.0.0.1 probe times out.
    command: `npm run preview -- --port ${PREVIEW_PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PREVIEW_PORT}`,
    reuseExistingServer: true,
  },
})
