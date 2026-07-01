import { useSyncExternalStore } from 'react'
import type { AppEvent, DownloadProgress, Phase, StatusPayload } from './types'

export interface AppSnapshot {
  phase: Phase
  download: DownloadProgress | null
  /** Most recent node_event of interest (peer joins etc.). */
  lastNodeEvent: { event: string; detail: Record<string, unknown>; at: number } | null
  status: StatusPayload | null
  connected: boolean
}

let snapshot: AppSnapshot = {
  phase: { phase: 'idle' },
  download: null,
  lastNodeEvent: null,
  status: null,
  connected: false,
}

const listeners = new Set<() => void>()

function set(update: Partial<AppSnapshot>) {
  snapshot = { ...snapshot, ...update }
  listeners.forEach((l) => l())
}

export function useApp(): AppSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

export function currentSnapshot(): AppSnapshot {
  return snapshot
}

let appEvents: EventSource | null = null
let statusEvents: EventSource | null = null
let statusPoll: ReturnType<typeof setInterval> | null = null

/** Connect the /app/events SSE feed; call once at App mount. */
export function connect() {
  if (appEvents) return
  appEvents = new EventSource('/app/events')
  appEvents.onopen = () => set({ connected: true })
  appEvents.onerror = () => set({ connected: false })
  appEvents.onmessage = (msg) => {
    let event: AppEvent
    try {
      event = JSON.parse(msg.data)
    } catch {
      return
    }
    if (event.type === 'phase') {
      const { type: _type, ...phase } = event
      set({ phase: phase as Phase })
      if (phase.phase === 'running') startStatusFeed()
      else stopStatusFeed()
    } else if (event.type === 'download_progress') {
      const { type: _type, ...progress } = event
      set({ download: progress as DownloadProgress })
    } else if (event.type === 'node_event') {
      set({ lastNodeEvent: { event: event.event, detail: event.detail, at: Date.now() } })
    }
  }
}

/** Live StatusPayload feed from the node once Running: SSE + slow poll fallback. */
function startStatusFeed() {
  if (statusEvents) return
  const apply = (status: StatusPayload) => set({ status })
  statusEvents = new EventSource('/api/events')
  statusEvents.onmessage = (msg) => {
    try {
      apply(JSON.parse(msg.data))
    } catch {
      /* ignore malformed frames */
    }
  }
  const poll = async () => {
    try {
      const resp = await fetch('/api/status')
      if (resp.ok) apply(await resp.json())
    } catch {
      /* node may be mid-restart */
    }
  }
  void poll()
  statusPoll = setInterval(poll, 10_000)
}

function stopStatusFeed() {
  statusEvents?.close()
  statusEvents = null
  if (statusPoll) clearInterval(statusPoll)
  statusPoll = null
  set({ status: null })
}

/** Test hook: reset module state between mocked scenarios. */
export function _resetForTests() {
  appEvents?.close()
  appEvents = null
  stopStatusFeed()
  snapshot = {
    phase: { phase: 'idle' },
    download: null,
    lastNodeEvent: null,
    status: null,
    connected: false,
  }
  listeners.forEach((l) => l())
}
