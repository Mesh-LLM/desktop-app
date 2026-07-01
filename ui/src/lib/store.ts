import { useSyncExternalStore } from 'react'
import type { AppEvent, DownloadProgress, Phase, StatusPayload } from './types'

export interface DownloadRate {
  bytesPerSec: number | null
  etaSeconds: number | null
}

export interface AppSnapshot {
  phase: Phase
  download: DownloadProgress | null
  /** Rolling-window transfer rate for the current download. */
  downloadRate: DownloadRate
  /** Most recent node_event of interest (peer joins etc.). */
  lastNodeEvent: { event: string; detail: Record<string, unknown>; at: number } | null
  status: StatusPayload | null
  connected: boolean
}

const IDLE_RATE: DownloadRate = { bytesPerSec: null, etaSeconds: null }

let snapshot: AppSnapshot = {
  phase: { phase: 'idle' },
  download: null,
  downloadRate: IDLE_RATE,
  lastNodeEvent: null,
  status: null,
  connected: false,
}

// Rate estimation over the last ~8s of progress events for one file. A new
// file (or a new download) resets the window so rates never mix.
let rateKey = ''
let rateSamples: Array<{ t: number; bytes: number }> = []

function trackRate(progress: DownloadProgress): DownloadRate {
  const key = `${progress.kind}:${progress.label}:${progress.file ?? ''}`
  if (key !== rateKey) {
    rateKey = key
    rateSamples = []
  }
  if (progress.done) {
    rateSamples = []
    return IDLE_RATE
  }
  if (progress.downloaded_bytes == null) return snapshot.downloadRate
  const now = performance.now()
  const last = rateSamples[rateSamples.length - 1]
  if (!last || last.bytes !== progress.downloaded_bytes || now - last.t > 1000) {
    rateSamples.push({ t: now, bytes: progress.downloaded_bytes })
  }
  while (rateSamples.length > 2 && now - rateSamples[0].t > 8000) rateSamples.shift()
  if (rateSamples.length < 2) return IDLE_RATE
  const first = rateSamples[0]
  const dt = (now - first.t) / 1000
  if (dt < 0.3) return IDLE_RATE
  const bytesPerSec = (progress.downloaded_bytes - first.bytes) / dt
  if (bytesPerSec <= 0) return IDLE_RATE
  const remaining =
    progress.total_bytes != null ? progress.total_bytes - progress.downloaded_bytes : null
  return {
    bytesPerSec,
    etaSeconds: remaining !== null ? remaining / bytesPerSec : null,
  }
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
      set({
        download: progress as DownloadProgress,
        downloadRate: trackRate(progress as DownloadProgress),
      })
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
  rateKey = ''
  rateSamples = []
  snapshot = {
    phase: { phase: 'idle' },
    download: null,
    downloadRate: IDLE_RATE,
    lastNodeEvent: null,
    status: null,
    connected: false,
  }
  listeners.forEach((l) => l())
}
