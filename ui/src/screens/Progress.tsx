import { useEffect, useState } from 'react'
import { Button, ProgressBar } from '../components/ui'
import { formatBytes } from '../lib/api'
import { useApp } from '../lib/store'

const SOVEREIGNTY_LINES = [
  'Once this finishes, your questions never leave your own mesh.',
  'No account. No cloud. No one listening in.',
  'This model will keep working even with the internet down.',
  'Everything stays between your devices — end-to-end encrypted.',
  'Invite friends later — their Macs make your mesh stronger.',
]

interface ProgressProps {
  onCancel: () => void
  onErrorReset: () => void
}

export default function Progress({ onCancel, onErrorReset }: ProgressProps) {
  const { phase, download } = useApp()
  const [lineIdx, setLineIdx] = useState(0)

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

  const isDownloading = phase.phase === 'downloading'
  const isRuntime = phase.phase === 'installing_runtime'
  const heading = isRuntime
    ? 'Preparing your Mac’s AI engine…'
    : isDownloading
      ? `Downloading ${phase.model}`
      : 'Waking it up…'
  const sub = isRuntime
    ? 'A one-time download so models can run on this Mac.'
    : isDownloading
      ? 'This is the whole model — every word it knows — coming to live on your Mac.'
      : 'Loading the model into your Mac’s AI memory — under a minute.'

  const activeDownload =
    download && !download.done && (isRuntime ? download.kind === 'runtime' : true) ? download : null
  const pct =
    activeDownload?.downloaded_bytes != null && activeDownload.total_bytes
      ? (activeDownload.downloaded_bytes / activeDownload.total_bytes) * 100
      : null

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

      <div className="w-full max-w-xl">
        <ProgressBar pct={isDownloading || isRuntime ? pct : null} />
        {activeDownload && (
          <p
            className="mt-3 text-center font-mono text-[13px] text-ink-muted"
            data-testid="progress-stats"
          >
            {pct !== null && `${Math.round(pct)}%`}
            {activeDownload.downloaded_bytes != null &&
              ` · ${formatBytes(activeDownload.downloaded_bytes)}${
                activeDownload.total_bytes ? ` of ${formatBytes(activeDownload.total_bytes)}` : ''
              }`}
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
