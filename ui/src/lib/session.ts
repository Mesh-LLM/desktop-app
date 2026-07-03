// Remembers the last mesh you launched so a fresh app open can offer a
// one-click "Back to mesh" instead of walking the whole wizard again.
//
// The backend's AppState is in-memory only (it starts Idle every launch), so
// this is the single source of "what was I last connected to". It mirrors the
// localStorage approach in theme.ts. Persisting only the *launch intent* (the
// same args the /app/host and /app/join calls take) keeps it tiny and lets us
// simply re-issue the original request to reconnect.

import type { Visibility } from './types'

/** The launch intent for each front-door flow, 1:1 with the appApi calls. */
export type LaunchConfig =
  | { kind: 'host'; model: string; visibility: Visibility }
  | { kind: 'join'; token: string; share: boolean; model?: string }
  | { kind: 'public'; share: boolean; model?: string }

const KEY = 'mesh-last-config'

/** The most recent launch, or null if none is remembered. */
export function loadLastConfig(): LaunchConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LaunchConfig
    // Defensive: only trust shapes we recognise (old/corrupt values are dropped).
    if (parsed?.kind === 'host' || parsed?.kind === 'join' || parsed?.kind === 'public') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function saveLastConfig(config: LaunchConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config))
  } catch {
    /* private mode / quota — resume just won't be offered next time */
  }
}

export function clearLastConfig(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/** Short human label for the "Back to mesh" button. */
export function lastConfigLabel(config: LaunchConfig): string {
  switch (config.kind) {
    case 'public':
      return 'Back to the global mesh'
    case 'join':
      return 'Back to the mesh you joined'
    case 'host':
      return config.visibility === 'private'
        ? 'Back to your private mesh'
        : 'Back to your mesh'
  }
}
