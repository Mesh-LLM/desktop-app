import { useEffect, useState } from 'react'
import { Button, ProgressBar, Spinner } from '../components/ui'
import { appApi, formatBytes } from '../lib/api'
import { useApp } from '../lib/store'
import type { CatalogEntry, DownloadProgress, Phase } from '../lib/types'

const GLOBAL_MESH_LINES = [
  'You’re joining machines around the world — end-to-end encrypted in transit.',
  'No account. No cloud in the middle. Just meshed machines.',
  'Heads up: global-mesh models run on machines other people own.',
  'Want it fully private? Start your own mesh and invite your people.',
  'Add this Mac’s power any time — every model makes the mesh stronger.',
]

interface PublicProgressProps {
  /** passive = chat-only connect; share = contributor serving a model. */
  flavor: 'public-passive' | 'public-share'
  /** Model queued to share once the connection is up (passive flavor). */
  pendingShare: string | null
  onShareModel: (model: string) => void
  onBrowseModels: () => void
  onStartChatting: () => void
  onCancel: () => void
  onErrorReset: () => void
}

type StageState = 'done' | 'active' | 'pending'

function formatEta(seconds: number): string {
  if (seconds < 60) return 'under a minute left'
  if (seconds < 90 * 60) return `about ${Math.max(1, Math.round(seconds / 60))} min left`
  return `about ${Math.round(seconds / 3600)} h left`
}

function StageChecklist({
  stages,
}: {
  stages: Array<{ id: string; label: string; state: StageState }>
}) {
  return (
    <div className="flex flex-col gap-2 font-mono text-[14px]" data-testid="progress-stages">
      {stages.map((stage) => (
        <div
          key={stage.id}
          data-testid={`stage-${stage.id}`}
          data-state={stage.state}
          className={`flex items-center gap-2 transition-opacity ${
            stage.state === 'pending' ? 'opacity-30' : 'opacity-100'
          }`}
        >
          <span className={stage.state === 'done' ? 'text-good' : 'text-accent'}>
            {stage.state === 'done' ? '+' : stage.state === 'active' ? '›' : '·'}
          </span>
          <span className={stage.state === 'active' ? 'text-ink' : 'text-ink-muted'}>
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The global-mesh flavor of the launch screen. Passive joins get
 * connection-centric copy (nothing downloads onto this Mac), a resting
 * "ready to chat" state, and an inline offer to also share a model;
 * contributors get the download checklist reframed around joining the
 * worldwide mesh rather than starting one.
 */
export default function PublicProgress({
  flavor,
  pendingShare,
  onShareModel,
  onBrowseModels,
  onStartChatting,
  onCancel,
  onErrorReset,
}: PublicProgressProps) {
  const { phase, download, downloadRate } = useApp()
  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setLineIdx((i) => (i + 1) % GLOBAL_MESH_LINES.length), 12_000)
    return () => clearInterval(t)
  }, [])

  if (phase.phase === 'error') {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-6 px-8"
        data-testid="error-screen"
      >
        <h1 className="text-[26px] font-bold tracking-tight">Something went wrong.</h1>
        <p className="max-w-lg text-center font-mono text-[13px] break-all text-ink-muted">
          {phase.message}
        </p>
        <div className="flex gap-3">
          <Button data-testid="error-retry" onClick={onErrorReset}>
            Start over
          </Button>
        </div>
      </div>
    )
  }

  const ready = flavor === 'public-passive' && phase.phase === 'running' && pendingShare === null

  return (
    <div
      className="relative flex h-screen flex-col items-center justify-center gap-8 px-8"
      data-testid="public-progress-screen"
      data-flavor={flavor}
    >
      {flavor === 'public-passive' ? (
        <PassiveBody
          pendingShare={pendingShare}
          onShareModel={onShareModel}
          onBrowseModels={onBrowseModels}
          onStartChatting={onStartChatting}
        />
      ) : (
        <ShareBody
          phase={phase}
          download={download}
          bytesPerSec={downloadRate.bytesPerSec}
          etaSeconds={downloadRate.etaSeconds}
        />
      )}

      <p className="max-w-md text-center text-[14px] text-ink-faint transition-opacity duration-700">
        {GLOBAL_MESH_LINES[lineIdx]}
      </p>

      <button
        className="absolute right-6 bottom-6 text-[13px] text-ink-faint hover:text-ink"
        onClick={onCancel}
        data-testid="cancel-setup"
      >
        {ready ? 'Leave the mesh' : 'Cancel'}
      </button>
    </div>
  )
}

/** Chat-only connect: no download happens, so the checklist is about the
 *  connection — plus the "also run a model?" upgrade offer, which stays
 *  useful in the resting ready state. */
function PassiveBody({
  pendingShare,
  onShareModel,
  onBrowseModels,
  onStartChatting,
}: {
  pendingShare: string | null
  onShareModel: (model: string) => void
  onBrowseModels: () => void
  onStartChatting: () => void
}) {
  const { phase } = useApp()
  const [installed, setInstalled] = useState<CatalogEntry[]>([])
  // Cosmetic beat: the backend reports one "starting" phase for the whole
  // connect, so the middle stage advances on time, not on state.
  const [beat, setBeat] = useState(0)

  useEffect(() => {
    let cancelled = false
    appApi
      .installedModels()
      .then((list) => {
        if (!cancelled) setInstalled(list.filter((m) => !m.draft))
      })
      .catch(() => {
        /* offer degrades to the browse link */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBeat(1), 2_200)
    return () => clearTimeout(t)
  }, [])

  const running = phase.phase === 'running'
  // Once running, this screen either rests at "ready to chat" or — with a
  // queued share — narrates the reconnect instead of flashing the chat.
  const switching = pendingShare !== null && running
  const ready = running && !switching

  const stages: Array<{ id: string; label: string; state: StageState }> = [
    {
      id: 'reach',
      label: 'Reach the global mesh',
      state: beat === 0 && !running ? 'active' : 'done',
    },
    {
      id: 'discover',
      label: 'Find machines running models',
      state: running ? 'done' : beat === 0 ? 'pending' : 'active',
    },
    { id: 'chat', label: 'Ready to chat', state: running ? 'done' : 'pending' },
  ]

  const heading = switching
    ? 'Switching to sharing…'
    : ready
      ? 'You’re on the global mesh.'
      : 'Connecting to the global mesh…'
  const sub = switching
    ? `Reconnecting with ${pendingShare} — takes a moment, and chat starts fresh.`
    : ready
      ? 'Chat with models other machines are running — nothing runs on this Mac.'
      : 'Nothing downloads onto this Mac — you’ll chat with models other machines are already running.'

  return (
    <>
      <div className="text-center">
        <h1 className="text-[28px] font-bold tracking-tight" data-testid="public-progress-heading">
          {heading}
        </h1>
        <p className="mt-3 max-w-lg text-[15px] text-ink-muted">{sub}</p>
      </div>

      <StageChecklist stages={stages} />

      {ready ? (
        <Button data-testid="start-chatting" onClick={onStartChatting}>
          Start chatting
        </Button>
      ) : (
        <Spinner />
      )}

      <div
        className="w-full max-w-xl rounded-(--radius-card) border border-edge bg-panel p-4"
        data-testid="public-upgrade-card"
      >
        <div className="text-[13px] font-semibold">Also run a model on this Mac?</div>
        <p className="mt-1 text-[12px] text-ink-muted">
          {installed.length > 0
            ? 'These are already downloaded — sharing one reconnects you in a moment and makes the mesh stronger.'
            : 'Serve a model to everyone in the mesh — we’ll check what this Mac can run first.'}
        </p>
        {installed.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {installed.slice(0, 3).map((m) => {
              const queued = pendingShare === m.name
              return (
                <li key={m.name}>
                  <button
                    data-testid={`public-share-${m.name}`}
                    disabled={pendingShare !== null}
                    onClick={() => onShareModel(m.name)}
                    className="group flex w-full items-center gap-2 rounded-(--radius-control) px-1.5 py-1 text-left transition-colors enabled:hover:bg-inset disabled:cursor-default"
                  >
                    <span className="truncate font-mono text-[12px]">{m.name}</span>
                    <span
                      className={`ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                        queued
                          ? 'border-accent/50 text-accent'
                          : 'border-edge text-ink-faint group-hover:border-accent/50 group-hover:text-accent'
                      }`}
                    >
                      {queued ? (switching ? 'Switching…' : 'Once connected…') : 'Share'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button
          data-testid="public-browse-models"
          disabled={pendingShare !== null}
          onClick={onBrowseModels}
          className="mt-2 text-[12px] text-accent underline-offset-2 hover:underline disabled:opacity-40"
        >
          Browse all models…
        </button>
      </div>
    </>
  )
}

/** Contributor: the model-download checklist, reframed around joining the
 *  worldwide mesh instead of starting your own. Also covers the brief idle
 *  beat between shutdown and rejoin during a passive→share switch. */
function ShareBody({
  phase,
  download,
  bytesPerSec,
  etaSeconds,
}: {
  phase: Phase
  download: DownloadProgress | null
  bytesPerSec: number | null
  etaSeconds: number | null
}) {
  const isRuntime = phase.phase === 'installing_runtime'
  const isDownloading = phase.phase === 'downloading'
  const isStarting = phase.phase === 'starting' || phase.phase === 'idle'
  const stages: Array<{ id: string; label: string; state: StageState }> = [
    {
      id: 'engine',
      label: "Prepare this Mac's AI engine",
      state: isRuntime ? 'active' : 'done',
    },
    {
      id: 'download',
      label: 'Download the model',
      state: isRuntime ? 'pending' : isDownloading ? 'active' : 'done',
    },
    {
      id: 'connect',
      label: 'Load into AI memory & join the global mesh',
      state: isStarting ? 'active' : 'pending',
    },
  ]

  const heading = isRuntime
    ? 'Preparing your Mac’s AI engine…'
    : isDownloading
      ? 'Downloading model…'
      : 'Joining the global mesh…'
  const sub = isRuntime
    ? 'A one-time download so models can run on this Mac.'
    : isDownloading
      ? 'Once this lands, your Mac serves it to everyone in the mesh.'
      : 'Loading the model into your Mac’s AI memory — under a minute.'

  const activeDownload =
    download &&
    !download.done &&
    (isRuntime ? download.kind === 'runtime' : download.kind === 'model')
      ? download
      : null
  const pct =
    activeDownload?.downloaded_bytes != null && activeDownload.total_bytes
      ? (activeDownload.downloaded_bytes / activeDownload.total_bytes) * 100
      : null
  const showBar = isRuntime || isDownloading

  return (
    <>
      <div className="text-center">
        <h1 className="text-[28px] font-bold tracking-tight" data-testid="public-progress-heading">
          {heading}
        </h1>
        <p className="mt-3 max-w-lg text-[15px] text-ink-muted">{sub}</p>
      </div>

      <StageChecklist stages={stages} />

      <div className="w-full max-w-xl">
        {showBar ? <ProgressBar pct={pct} /> : <Spinner className="mx-auto" />}
        {activeDownload && (
          <p
            className="mt-3 text-center font-mono text-[13px] text-ink-muted"
            data-testid="progress-stats"
          >
            {pct !== null && `${pct.toFixed(pct < 10 ? 1 : 0)}%`}
            {activeDownload.downloaded_bytes != null &&
              ` · ${formatBytes(activeDownload.downloaded_bytes)}${
                activeDownload.total_bytes ? ` of ${formatBytes(activeDownload.total_bytes)}` : ''
              }`}
            {bytesPerSec !== null && ` · ${formatBytes(bytesPerSec)}/s`}
            {etaSeconds !== null && ` · ${formatEta(etaSeconds)}`}
          </p>
        )}
        {activeDownload?.file && (
          <p className="mt-1 truncate text-center font-mono text-[11px] text-ink-faint">
            {activeDownload.file}
          </p>
        )}
      </div>
    </>
  )
}
