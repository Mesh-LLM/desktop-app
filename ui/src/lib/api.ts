import type {
  ChatCompletedInfo,
  DiagnoseReport,
  HistoryMessage,
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
  join: (token: string, share: boolean, model?: string, opts?: { public?: boolean }) =>
    fetch('/app/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        share,
        model: model ?? null,
        public: opts?.public ?? false,
      }),
    }).then((r) => json<{ ok: boolean }>(r)),
  invite: () => fetch('/app/invite').then((r) => json<{ token: string; approx_bytes: number }>(r)),
  shutdown: () => fetch('/app/shutdown', { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),
  reset: () => fetch('/app/reset', { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),
  /** The persisted conversation, to repaint the ongoing chat on launch. */
  history: () => fetch('/app/history').then((r) => json<HistoryMessage[]>(r)),
  /** "New chat": forget the current session so the next turn starts fresh. */
  newChat: () => fetch('/app/new_chat', { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),
  /** One-shot read of an invite token delivered by a mesh:// deep link before
   *  the frontend was listening (e.g. the link launched the app). */
  pendingInvite: () => fetch('/app/pending_invite').then((r) => json<{ token: string | null }>(r)),
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
  onToolCall?: (tool: { id: string; name: string }) => void
  onToolResult?: (tool: { id: string; ok: boolean }) => void
  onCompleted?: (info: ChatCompletedInfo) => void
  onError?: (message: string) => void
}

/**
 * Streams one agent turn through POST /app/chat (SSE). The goose agent keeps
 * the conversation history server-side, so only the new user message is sent.
 * Returns when the stream finishes.
 */
export async function streamChat(
  model: string,
  text: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch('/app/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, text }),
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
    } else if (type === 'response.tool_call') {
      handlers.onToolCall?.({
        id: (parsed.id as string) ?? '',
        name: (parsed.name as string) ?? 'tool',
      })
    } else if (type === 'response.tool_result') {
      handlers.onToolResult?.({
        id: (parsed.id as string) ?? '',
        ok: (parsed.ok as boolean) ?? true,
      })
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

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}
