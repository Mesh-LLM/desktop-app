import { useEffect, useState } from 'react'
import { Button, ProgressBar, Spinner } from '../components/ui'
import { formatBytes } from '../lib/api'
import { useApp } from '../lib/store'

const SOVEREIGNTY_LINES = [
  'Once this finishes, your questions never leave your own mesh.',
  'No account. No cloud. No one listening in.',
  'This model will keep working even with the internet down.',
  'Everything stays between your devices — end-to-end encrypted.',
  'Invite friends later — their computers make the mesh more intelligent.',
  'Remember to invite friends — every machine you add makes the whole mesh smarter.',
  'The more people in your mesh, the more intelligent it gets. Invite your people.',
]

interface ProgressProps {
  onCancel: () => void
  onErrorReset: () => void
}

type StageState = 'done' | 'active' | 'pending'

function formatEta(seconds: number): string {
  if (seconds < 60) return 'under a minute left'
  if (seconds < 90 * 60) return `about ${Math.max(1, Math.round(seconds / 60))} min left`
  return `about ${Math.round(seconds / 3600)} h left`
}

export default function Progress({ onCancel, onErrorReset }: ProgressProps) {
  const { phase, download, downloadRate } = useApp()
  const [lineIdx, setLineIdx] = useState(0)
  const { bytesPerSec, etaSeconds } = downloadRate

  useEffect(() => {
    const t = setInterval(() => setLineIdx((i) => (i + 1) % SOVEREIGNTY_LINES.length), 12_000)
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
      id: 'load',
      label: 'Load into AI memory & start your mesh',
      state: isStarting ? 'active' : 'pending',
    },
  ]

  const heading = isRuntime
    ? 'Preparing your Mac’s AI engine…'
    : isDownloading
      ? 'Downloading model…'
      : 'Waking it up…'
  const sub = isRuntime
    ? 'A one-time download so models can run on this Mac.'
    : isDownloading
      ? 'This is the whole model — every word it knows — coming to live on your Mac.'
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
    <div
      className="flex h-screen flex-col items-center justify-center gap-8 px-8"
      data-testid="progress-screen"
    >
      <div className="text-center">
        <h1 className="text-[28px] font-bold tracking-tight" data-testid="progress-heading">
          {heading}
        </h1>
        <p className="mt-3 max-w-lg text-[15px] text-ink-muted">{sub}</p>
      </div>

      {/* stage checklist */}
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

      <p className="max-w-md text-center text-[14px] text-ink-faint transition-opacity duration-700">
        {SOVEREIGNTY_LINES[lineIdx]}
      </p>

      <button
        className="absolute right-6 bottom-6 text-[13px] text-ink-faint hover:text-ink"
        onClick={onCancel}
        data-testid="cancel-setup"
      >
        Cancel setup
      </button>
    </div>
  )
}
