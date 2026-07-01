import type {
  ChatCompletedInfo,
  DiagnoseReport,
  Phase,
  StatusPayload,
  V1Model,
  Visibility,
} from './types'

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail: string
    try {
      detail = JSON.stringify(await resp.json())
    } catch {
      detail = resp.statusText
    }
    throw new Error(`${resp.status}: ${detail}`)
  }
  return (await resp.json()) as T
}

export const appApi = {
  state: () => fetch('/app/state').then((r) => json<Phase>(r)),
  diagnose: () => fetch('/app/diagnose', { method: 'POST' }).then((r) => json<DiagnoseReport>(r)),
  host: (model: string, visibility: Visibility, meshName?: string) =>
    fetch('/app/host', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, visibility, mesh_name: meshName ?? null }),
    }).then((r) => json<{ ok: boolean }>(r)),
  join: (token: string, share: boolean, model?: string) =>
    fetch('/app/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, share, model: model ?? null }),
    }).then((r) => json<{ ok: boolean }>(r)),
  invite: () => fetch('/app/invite').then((r) => json<{ token: string; approx_bytes: number }>(r)),
  shutdown: () => fetch('/app/shutdown', { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),
  reset: () => fetch('/app/reset', { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),
}

export const nodeApi = {
  status: () => fetch('/api/status').then((r) => json<StatusPayload>(r)),
  models: () => fetch('/v1/models').then((r) => json<{ data: V1Model[] }>(r)),
}

/** Local, offline shape check for an invite code (base64url JSON). */
export function looksLikeInviteToken(raw: string): boolean {
  const token = raw.trim()
  if (token.length < 40 || /\s/.test(token)) return false
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return false
  try {
    const pad = '='.repeat((4 - (token.length % 4)) % 4)
    const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/') + pad)
    const parsed = JSON.parse(decoded)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

export interface ChatStreamHandlers {
  onDelta: (text: string) => void
  onReasoningDelta?: (text: string) => void
  onCompleted?: (info: ChatCompletedInfo) => void
  onError?: (message: string) => void
}

/**
 * Streams a chat turn through POST /api/responses (SSE). Returns when the
 * stream finishes. Parsing mirrors the mesh console's mesh-connection.ts.
 */
export async function streamChat(
  model: string,
  input: Array<{ role: string; content: string }>,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      client_id: clientId(),
      request_id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      input,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  })
  if (!resp.ok || !resp.body) {
    handlers.onError?.(`chat request failed (${resp.status})`)
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''
  // Client-side timing fallback, mirroring the operator console: the server
  // only includes timings on some paths.
  const startedAt = performance.now()
  let firstDeltaAt: number | null = null
  let lastDeltaAt: number | null = null

  const handleData = (data: string) => {
    if (data === '[DONE]') return
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    const type = (parsed.type as string) ?? eventName
    if (type === 'response.output_text.delta') {
      if (firstDeltaAt === null) firstDeltaAt = performance.now()
      lastDeltaAt = performance.now()
      handlers.onDelta((parsed.delta as string) ?? '')
    } else if (type === 'response.reasoning_text.delta') {
      if (firstDeltaAt === null) firstDeltaAt = performance.now()
      lastDeltaAt = performance.now()
      handlers.onReasoningDelta?.((parsed.delta as string) ?? '')
    } else if (type === 'response.completed') {
      const response = (parsed.response ?? {}) as Record<string, unknown>
      const fallbackTimings =
        firstDeltaAt !== null && lastDeltaAt !== null
          ? {
              ttft_ms: firstDeltaAt - startedAt,
              decode_time_ms: Math.max(1, lastDeltaAt - firstDeltaAt),
              total_time_ms: lastDeltaAt - startedAt,
            }
          : undefined
      handlers.onCompleted?.({
        model: response.model as string | undefined,
        served_by: response.served_by as string | undefined,
        usage: response.usage as ChatCompletedInfo['usage'],
        timings: (response.timings as ChatCompletedInfo['timings']) ?? fallbackTimings,
      })
    } else if (eventName === 'error' || type === 'error') {
      handlers.onError?.((parsed.message as string) ?? 'stream error')
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trimEnd()
      buffer = buffer.slice(idx + 1)
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        handleData(line.slice(5).trim())
      } else if (line === '') {
        eventName = ''
      }
    }
  }
}

let cachedClientId: string | null = null
function clientId(): string {
  if (!cachedClientId) {
    cachedClientId =
      localStorage.getItem('mesh-client-id') ??
      `mesh-desktop-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('mesh-client-id', cachedClientId)
  }
  return cachedClientId
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}
