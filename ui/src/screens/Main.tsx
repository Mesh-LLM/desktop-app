import { useCallback, useEffect, useMemo, useState } from 'react'
import AppNavigation from '../components/AppNavigation'
import Chat from '../components/Chat'
import ChatHistorySidebar from '../components/ChatHistorySidebar'
import { InviteModal } from '../components/InvitePanel'
import MeshPanel from '../components/MeshPanel'
import {
  activateChatSession,
  createChatSession,
  listChatSessions,
  loadActiveChatId,
  saveActiveChatId,
  setChatArchived,
  type ChatSessionSummary,
} from '../lib/chat-sessions'
import { useApp } from '../lib/store'
import type { Phase } from '../lib/types'

interface MainProps {
  onLeave: () => void
  onOpenSettings: () => void
  onGoHome: () => void
  onStartSharing?: () => void
}

function runningInfo(phase: Phase) {
  return phase.phase === 'running' ? phase : null
}

export default function Main({ onOpenSettings, onGoHome, onStartSharing }: MainProps) {
  const { phase, status, lastNodeEvent } = useApp()
  const info = runningInfo(phase)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [justJoined, setJustJoined] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(loadActiveChatId)
  const [sessionsSupported, setSessionsSupported] = useState(true)

  const token = status?.token ?? info?.invite_token ?? null
  const isPrivate = !(info?.visibility === 'public' || status?.publication_state === 'public')
  const hostname = status?.my_hostname ?? status?.hostname
  const meshName =
    info?.mesh_name ?? (hostname ? `${hostname.replace(/\.local$/, '')}'s mesh` : 'Your mesh')
  const peers = useMemo(() => status?.peers ?? [], [status?.peers])
  const canServe = Boolean(info?.serving)
  const canUpgrade = !canServe && info?.mode === 'join' && info?.visibility === 'public'

  const refreshSessions = useCallback(async () => {
    try {
      const result = await listChatSessions()
      setSessionsSupported(true)
      let available = result.sessions
      if (available.length === 0) {
        const created = await createChatSession()
        available = [created]
      }
      setSessions(available)
      const preferred = loadActiveChatId()
      const active =
        (preferred && available.some((session) => session.id === preferred) && preferred) ||
        result.active_session_id ||
        available[0]?.id ||
        null
      setActiveSessionId(active)
      if (active) saveActiveChatId(active)
    } catch {
      // Older backend compatibility: Chat falls back to /app/history and the
      // single conversation remains available while the app upgrades.
      setSessionsSupported(false)
      setSessions([])
      setActiveSessionId(null)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void refreshSessions(), 0)
    return () => clearTimeout(timer)
  }, [refreshSessions])

  useEffect(() => {
    if (lastNodeEvent?.event !== 'peer_joined') return
    const label =
      (lastNodeEvent.detail.label as string) ??
      `${String(lastNodeEvent.detail.peer_id ?? '').slice(0, 8)}…`
    const show = setTimeout(() => setJustJoined(label), 0)
    const hide = setTimeout(() => setJustJoined(null), 8000)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [lastNodeEvent])

  const selectSession = async (id: string) => {
    if (streaming || id === activeSessionId) return
    try {
      await activateChatSession(id)
      setActiveSessionId(id)
    } catch {
      /* keep the current conversation selected */
    }
  }

  const archiveSession = async (id: string, archived: boolean) => {
    if (streaming) return
    try {
      await setChatArchived(id, archived)
      if (archived && id === activeSessionId) {
        const next = sessions.find((session) => session.id !== id && !session.archived)
        if (next) {
          await activateChatSession(next.id)
          setActiveSessionId(next.id)
        } else {
          const created = await createChatSession()
          setActiveSessionId(created.id)
        }
      }
      await refreshSessions()
    } catch {
      /* preserve the current list if archiving fails */
    }
  }

  const newSession = async () => {
    if (streaming || !sessionsSupported) return
    const current = sessions.find((session) => session.id === activeSessionId)
    // Blank sessions are disposable drafts, not chat history. Reuse the active
    // draft so repeated New Chat clicks never accumulate empty conversations.
    if (current?.message_count === 0) return
    try {
      const session = await createChatSession()
      saveActiveChatId(session.id)
      setSessions((existing) => [session, ...existing.filter((item) => item.id !== session.id)])
      setActiveSessionId(session.id)
    } catch {
      /* the current conversation remains usable */
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <AppNavigation
        current="chat"
        connected
        meshName={meshName}
        isPublic={!isPrivate}
        onHome={onGoHome}
        onChat={() => {}}
        onSettings={onOpenSettings}
      />
      <div className="flex min-h-0 grow">
        <ChatHistorySidebar
          sessions={sessions}
          activeId={activeSessionId}
          streaming={streaming}
          onSelect={(id) => void selectSession(id)}
          onNew={() => void newSession()}
          onArchive={(id, archived) => void archiveSession(id, archived)}
        />

        <main className="min-w-0 grow">
          <Chat
            key={activeSessionId ?? 'legacy'}
            sessionId={activeSessionId}
            ready={!sessionsSupported || activeSessionId !== null}
            hostname={hostname}
            onStreamingChange={setStreaming}
            onConversationChanged={() => void refreshSessions()}
          />
        </main>

        <MeshPanel
          meshName={meshName}
          isPrivate={isPrivate}
          peers={peers}
          self={{
            name: 'This Mac',
            serving: canServe,
            model: info?.model ?? null,
            vramGb: status?.my_vram_gb,
          }}
          streaming={streaming}
          token={token}
          onInvite={() => setInviteOpen(true)}
          onStartSharing={canUpgrade ? onStartSharing : undefined}
        />

        {inviteOpen && token && (
          <InviteModal
            token={token}
            isPrivate={isPrivate}
            onClose={() => setInviteOpen(false)}
            justJoined={justJoined}
          />
        )}

        {justJoined && !inviteOpen && (
          <div
            className="animate-message-in fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-(--radius-card) border border-good/40 bg-panel px-4 py-3 text-sm shadow-xl"
            data-testid="peer-toast"
          >
            <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
            {justJoined} joined your mesh
          </div>
        )}
      </div>
    </div>
  )
}
