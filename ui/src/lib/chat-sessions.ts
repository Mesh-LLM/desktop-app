import type { HistoryMessage } from './types'

export interface ChatSessionSummary {
  id: string
  title?: string
  name?: string
  created_at: string
  updated_at: string
  message_count: number
  archived?: boolean
}

export interface ChatSessionList {
  active_session_id: string | null
  sessions: ChatSessionSummary[]
}

const ACTIVE_KEY = 'mesh-active-chat-session'

export function loadActiveChatId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function saveActiveChatId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* backend also persists the active Goose session */
  }
}

export async function listChatSessions(): Promise<ChatSessionList> {
  const response = await fetch('/app/sessions')
  if (!response.ok) throw new Error(`sessions request failed (${response.status})`)
  const payload = (await response.json()) as ChatSessionList | ChatSessionSummary[]
  if (Array.isArray(payload)) {
    return {
      active_session_id:
        payload.find((session) => (session as ChatSessionSummary & { active?: boolean }).active)
          ?.id ?? null,
      sessions: payload.map(normalizeSession),
    }
  }
  return { ...payload, sessions: payload.sessions.map(normalizeSession) }
}

export async function createChatSession(): Promise<ChatSessionSummary> {
  const response = await fetch('/app/sessions', { method: 'POST' })
  if (!response.ok) throw new Error(`create session failed (${response.status})`)
  return normalizeSession((await response.json()) as ChatSessionSummary)
}

export async function activateChatSession(id: string): Promise<void> {
  const response = await fetch(`/app/sessions/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`activate session failed (${response.status})`)
  saveActiveChatId(id)
}

export async function setChatArchived(id: string, archived: boolean): Promise<void> {
  const response = await fetch(`/app/sessions/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ archived }),
  })
  if (!response.ok) throw new Error(`archive session failed (${response.status})`)
}

export async function loadChatHistory(id: string): Promise<HistoryMessage[]> {
  const response = await fetch(`/app/sessions/${encodeURIComponent(id)}/history`)
  if (!response.ok) throw new Error(`history request failed (${response.status})`)
  return response.json() as Promise<HistoryMessage[]>
}

function normalizeSession(session: ChatSessionSummary): ChatSessionSummary {
  return { ...session, title: session.title || session.name || 'New chat' }
}

export function titleFromMessages(messages: HistoryMessage[]): string {
  const first = messages.find((message) => message.role === 'user')?.text.trim()
  if (!first) return 'New chat'
  return first.length > 42 ? `${first.slice(0, 42).trimEnd()}…` : first
}
