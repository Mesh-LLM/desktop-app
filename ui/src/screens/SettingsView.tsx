import {
  Disc3,
  History,
  LogOut,
  MonitorSmartphone,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import MeshMark from '../components/MeshMark'
import { listChatSessions, setChatArchived, type ChatSessionSummary } from '../lib/chat-sessions'
import { Button } from '../components/ui'
import { useApp } from '../lib/store'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'

interface SettingsViewProps {
  onClose: () => void
  /** Present when settings is opened from an active mesh. */
  onLeave?: () => void
}

const THEME_OPTIONS: Array<{ id: ThemePref; label: string; Icon: typeof Sun; hint: string }> = [
  { id: 'dark', label: 'Dark', Icon: Moon, hint: 'Black, minimal, high contrast.' },
  { id: 'light', label: 'Light', Icon: Sun, hint: 'Bright panels for daylight.' },
  { id: 'vinyl', label: 'Vinyl', Icon: Disc3, hint: 'Retro amber and warm paper tones.' },
  { id: 'system', label: 'Auto', Icon: MonitorSmartphone, hint: 'Follow this Mac.' },
]

export default function SettingsView({ onClose, onLeave }: SettingsViewProps) {
  const { phase, status } = useApp()
  const [archivedChats, setArchivedChats] = useState<ChatSessionSummary[]>([])

  useEffect(() => {
    void listChatSessions()
      .then(({ sessions }) => setArchivedChats(sessions.filter((session) => session.archived)))
      .catch(() => setArchivedChats([]))
  }, [])

  const restoreChat = async (id: string) => {
    await setChatArchived(id, false)
    setArchivedChats((sessions) => sessions.filter((session) => session.id !== id))
  }
  const running = phase.phase === 'running' ? phase : null
  const hostname = status?.my_hostname ?? status?.hostname
  const meshName =
    running?.mesh_name ?? (hostname ? `${hostname.replace(/\.local$/, '')}'s mesh` : 'No mesh yet')
  const visibility =
    running || status
      ? running?.visibility === 'public' || status?.publication_state === 'public'
        ? 'Open'
        : 'Invite-only'
      : 'Not connected'
  const sharing = running?.serving
    ? `Sharing ${shortModel(running.model ?? 'a model')}`
    : running
      ? 'Just chatting'
      : 'Choose a mesh from the start screen when you’re ready.'

  return (
    <div
      data-testid="settings-view"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 px-6 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-2xl animate-message-in rounded-(--radius-card) border border-edge bg-panel p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-(--radius-control) border border-accent/40 bg-accent/[0.08] text-accent">
              <Settings size={20} aria-hidden />
            </div>
            <div>
              <h1 id="settings-title" className="font-display text-[24px] font-bold tracking-tight">
                Settings
              </h1>
              <p className="mt-1 text-sm text-ink-muted">Tune Mesh before or after you connect.</p>
            </div>
          </div>
          <button
            data-testid="settings-close"
            onClick={onClose}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-inset hover:text-ink"
            aria-label="Close settings"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-(--radius-card) border border-edge bg-inset p-4">
            <div className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
              Appearance
            </div>
            <ThemePicker />
          </section>

          <section className="rounded-(--radius-card) border border-edge bg-inset p-4">
            <div className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
              Mesh
            </div>
            <div className="mt-3 flex items-start gap-3">
              <MeshMark size={20} className="mt-0.5 text-accent" pulse={Boolean(running)} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" data-testid="settings-mesh-name">
                  {meshName}
                </div>
                <p className="mt-1 text-[12px] text-ink-muted">{visibility}</p>
                <p className="mt-2 text-[12px] text-ink-faint">{sharing}</p>
              </div>
            </div>
          </section>
        </div>

        <section
          className="mt-4 rounded-(--radius-card) border border-edge bg-inset p-4"
          data-testid="settings-chat-history"
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
            <History size={13} aria-hidden /> Archived chats
          </div>
          {archivedChats.length === 0 ? (
            <p className="mt-3 text-[12px] text-ink-faint">No archived chats.</p>
          ) : (
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
              {archivedChats.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-(--radius-control) bg-panel px-3 py-2"
                >
                  <span className="min-w-0 grow truncate text-[12px] text-ink-muted">
                    {session.title || session.name || 'Chat'}
                  </span>
                  <button
                    data-testid="settings-chat-restore"
                    onClick={() => void restoreChat(session.id)}
                    className="flex shrink-0 items-center gap-1 text-[11px] text-accent hover:underline"
                  >
                    <RotateCcw size={11} aria-hidden /> Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {running && onLeave && (
          <div className="mt-4 rounded-(--radius-card) border border-bad/30 bg-bad/[0.06] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Leave this mesh</div>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Disconnect this Mac and return to the start screen.
                </p>
              </div>
              <button
                data-testid="leave-mesh"
                onClick={onLeave}
                className="flex shrink-0 items-center gap-1.5 rounded-(--radius-control) border border-bad/50 px-3 py-2 text-sm text-bad transition-colors hover:bg-bad/10"
              >
                <LogOut size={14} aria-hidden />
                Leave
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button data-testid="settings-done" onClick={onClose} variant="quiet">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

function ThemePicker() {
  const pref = useThemePref()
  return (
    <div className="mt-3" data-testid="theme-picker">
      <div className="grid gap-2 sm:grid-cols-2">
        {THEME_OPTIONS.map(({ id, label, Icon, hint }) => (
          <button
            key={id}
            data-testid={`theme-${id}`}
            onClick={() => setThemePref(id)}
            className={`rounded-(--radius-control) border p-3 text-left transition-all hover:-translate-y-0.5 ${
              pref === id
                ? 'border-accent/70 bg-accent/[0.08] text-accent shadow-[0_8px_24px_-16px_var(--color-accent)]'
                : 'border-edge bg-panel text-ink hover:border-accent/50'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon size={15} aria-hidden />
              {label}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{hint}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function shortModel(ref: string): string {
  const tail = ref.split('/').pop() ?? ref
  return tail.replace(/-GGUF.*$/, '').replace(/@.*$/, '')
}
