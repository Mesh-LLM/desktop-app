import { expect } from '@playwright/test'

export const TINY_MODEL = 'Qwen3-0.6B-Q4_K_M'

/** Drive the primary daemon to a running host mesh (idempotent). */
export async function ensureHostRunning(baseURL: string): Promise<void> {
  const state = await (await fetch(`${baseURL}/app/state`)).json()
  if (state.phase === 'running') return
  if (state.phase === 'idle' || state.phase === 'error') {
    await fetch(`${baseURL}/app/host`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: TINY_MODEL, visibility: 'private', mesh_name: null }),
    })
  }
  await expect
    .poll(async () => (await (await fetch(`${baseURL}/app/state`)).json()).phase, {
      timeout: 360_000,
      intervals: [2000],
    })
    .toBe('running')
}

/**
 * Shut the mesh down and host it again: guarantees a FRESH goose agent
 * session (teardown on shutdown), so earlier specs' chat history can't
 * steer the model in this one.
 */
export async function restartHostFresh(baseURL: string): Promise<void> {
  await fetch(`${baseURL}/app/shutdown`, { method: 'POST' })
  await ensureHostRunning(baseURL)
}
