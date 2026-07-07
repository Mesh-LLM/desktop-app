import { Disc3, LogOut, MonitorSmartphone, Moon, Plus, Settings, Sparkles, Sun } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Chat from '../components/Chat'
import { InviteModal } from '../components/InvitePanel'
import MeshMark from '../components/MeshMark'
import MeshViz from '../components/MeshViz'
import { nodeApi } from '../lib/api'
import { useApp } from '../lib/store'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import type { Phase } from '../lib/types'

interface MainProps {
  onLeave: () => void
  /** Kick off the passive→contributor upgrade (public mesh only). */
  onStartSharing?: () => void
}

function runningInfo(phase: Phase) {
  return phase.phase === 'running' ? phase : null
}

export default function Main({ onLeave, onStartSharing }: MainProps) {
  const { phase, status, lastNodeEvent } = useApp()
  const info = runningInfo(phase)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; label: string; local: boolean }>>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [justJoined, setJustJoined] = useState<string | null>(null)

  const token = status?.token ?? info?.invite_token ?? null
  // Open if either our own record (RunningInfo, e.g. the global mesh or a public
  // host) or the live node status says so — private is the safe default.
  const isPrivate = !(info?.visibility === 'public' || status?.publication_state === 'public')
  const hostname = status?.my_hostname ?? status?.hostname
  const meshName =
    info?.mesh_name ?? (hostname ? `${hostname.replace(/\.local$/, '')}'s mesh` : 'Your mesh')

  // Model list: /v1/models has chat-ready ids that propagate across the mesh.
  // Virtual refs (mesh-app's ladder, validated there in tests/model_selection.rs):
  //   "auto" — mesh routes each request to the best-fit model; works with 1+.
  //   "mesh" — Mixture-of-Agents fan-out; the mesh 503s below 2 real models,
  //            and only advertises the "mesh" id itself once ≥2 exist.
  // Smart default: public mesh or ≥3 real models → "mesh", else "auto".
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await nodeApi.models()
        if (cancelled) return
        const serving = new Set(status?.serving_models ?? [])
        const real = data.filter((m) => m.id !== 'mesh' && m.id !== 'auto')
        const meshAdvertised = data.some((m) => m.id === 'mesh')
        const list = [
          { id: 'auto', label: 'Auto (best fit)', local: false },
          ...(meshAdvertised ? [{ id: 'mesh', label: 'Mixture (all models)', local: false }] : []),
          ...real.map((m) => ({
            id: m.id,
            label: m.display_name && m.display_name !== m.id ? m.display_name : shortModel(m.id),
            local: [...serving].some(
              (s) => s.includes(m.id) || m.id.includes(s.split('@')[0] ?? s),
            ),
          })),
        ]
        setModels(list)
        const smart = (!isPrivate || real.length >= 3) && meshAdvertised ? 'mesh' : 'auto'
        setSelectedModel((sel) => sel ?? smart)
      } catch {
        /* node restarting */
      }
    }
    void load()
    const t = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [status?.serving_models, isPrivate])

  // Peer-join toast + invite modal live line. setState happens inside timer
  // callbacks (never synchronously in the effect body) to avoid cascading
  // renders — react-hooks/set-state-in-effect.
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

  const peers = useMemo(() => status?.peers ?? [], [status?.peers])
  const people = useMemo(() => {
    const self = {
      key: 'self',
      name: 'This Mac',
      sub: info?.serving && info.model ? `sharing ${shortModel(info.model)}` : 'just chatting',
      state: 'good' as const,
    }
    const others = peers.map((p, i) => ({
      key: p.node_id ?? String(i),
      name: p.hostname ?? `${(p.node_id ?? '').slice(0, 8)}…`,
      sub: p.serving_models?.length
        ? `sharing ${shortModel(p.serving_models[0])}`
        : 'just chatting',
      state: 'good' as const,
    }))
    return [self, ...others]
  }, [peers, info])

  // Which installed models are actually loaded on THIS node right now. Match by
  // Whether this node is sharing its compute (can run models locally). Drives
  // the "start sharing" upgrade offer for chat-only clients.
  const canServe = Boolean(info?.serving)

  return (
    <div className="flex h-screen">
      {/* sidebar */}
      <aside className="flex w-[270px] shrink-0 flex-col border-r border-edge bg-panel">
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 font-semibold">
            <MeshMark size={17} className="text-accent" pulse={streaming} />
            <span data-testid="mesh-name">{meshName}</span>
          </div>
          <div
            className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-muted"
            data-testid="mesh-status"
          >
            <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
            Live · {isPrivate ? 'invite-only' : 'open'}
          </div>
        </div>

        <MeshViz
          variant="mini"
          peers={peers.length}
          streaming={streaming}
          className="mx-4 mt-3 h-[110px] rounded-(--radius-control) bg-inset"
        />

        <div className="mt-4 grow overflow-y-auto px-4">
          <SectionLabel label="People" count={people.length} />
          <ul className="mt-1 flex flex-col gap-2" data-testid="people-list">
            {people.map((p) => (
              <li key={p.key} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
                  <span className="truncate font-medium">{p.name}</span>
                </div>
                <div className="pl-4 text-[12px] text-ink-faint">{p.sub}</div>
              </li>
            ))}
            {peers.length === 0 && (
              <li
                className="pl-4 text-[12px] text-ink-faint italic"
                data-testid="waiting-for-peers"
              >
                Waiting for your first invitee…{' '}
                <button
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={() => setInviteOpen(true)}
                >
                  Show invite
                </button>
              </li>
            )}
          </ul>

          {!canServe &&
            info?.mode === 'join' &&
            info?.visibility === 'public' &&
            onStartSharing && (
              // On the global mesh the upgrade is one click away: shutdown +
              // rejoin with a model (the chat-only node has no AI runtime).
              <div className="mt-5">
                <button
                  data-testid="start-sharing"
                  onClick={onStartSharing}
                  className="flex items-center gap-1.5 pl-1.5 text-[11px] text-accent underline-offset-2 hover:underline"
                >
                  <Sparkles size={11} aria-hidden />
                  Start sharing this Mac&rsquo;s power…
                </button>
              </div>
            )}
        </div>

        <div className="flex flex-col gap-2 p-4">
          <button
            data-testid="invite-button"
            onClick={() => setInviteOpen(true)}
            disabled={!token}
            className="flex w-full items-center justify-center gap-2 rounded-(--radius-control) border border-accent/60 bg-panel px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden />
            Invite someone
          </button>
          <div className="relative">
            <button
              data-testid="settings-button"
              onClick={() => setSettingsOpen((s) => !s)}
              className="flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              <Settings size={14} aria-hidden />
              Settings
            </button>
            {settingsOpen && (
              <div
                className="absolute bottom-8 left-0 z-40 w-64 rounded-(--radius-card) border border-edge bg-inset p-4 shadow-xl"
                data-testid="settings-popover"
              >
                <div className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
                  This Mac
                </div>
                <div className="mt-2 text-[13px]">
                  {info?.serving && info.model
                    ? `Sharing ${shortModel(info.model)}`
                    : 'Just chatting'}
                </div>
                <hr className="my-3 border-edge" />
                <ThemePicker />
                <hr className="my-3 border-edge" />
                <button
                  data-testid="leave-mesh"
                  onClick={onLeave}
                  className="flex items-center gap-1.5 text-[13px] text-bad hover:underline"
                >
                  <LogOut size={13} aria-hidden />
                  Leave this mesh…
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* chat */}
      <main className="min-w-0 grow">
        <Chat
          models={models}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          hostname={hostname}
          onStreamingChange={setStreaming}
        />
      </main>

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
  )
}

const THEME_OPTIONS: Array<{ id: ThemePref; label: string; Icon: typeof Sun }> = [
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'vinyl', label: 'Vinyl', Icon: Disc3 },
  { id: 'system', label: 'Auto', Icon: MonitorSmartphone },
]

function ThemePicker() {
  const pref = useThemePref()
  return (
    <div data-testid="theme-picker">
      <div className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
        Appearance
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {THEME_OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            data-testid={`theme-${id}`}
            onClick={() => setThemePref(id)}
            className={`flex items-center gap-1.5 rounded-(--radius-control) border px-2.5 py-1.5 text-[12px] transition-colors ${
              pref === id
                ? 'border-accent/60 text-accent'
                : 'border-edge text-ink-muted hover:text-ink'
            }`}
          >
            <Icon size={13} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
      <span>{label}</span>
      <span className="font-mono">{count}</span>
    </div>
  )
}

function shortModel(ref: string): string {
  const tail = ref.split('/').pop() ?? ref
  return tail.replace(/-GGUF.*$/, '').replace(/@.*$/, '')
}
