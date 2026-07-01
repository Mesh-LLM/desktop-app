import { useEffect, useState } from 'react'
import { BackButton, Button, FitBadge } from '../components/ui'
import { appApi } from '../lib/api'
import type { DiagnoseReport } from '../lib/types'

interface PowerSetupProps {
  onBack: () => void
  onModelChosen: (model: string, report: DiagnoseReport) => void
}

const SCAN_LINES = ['Chip', 'AI memory', 'Free disk', 'Best model'] as const
const SCAN_BEAT_MS = 700

/**
 * The shared "Power Setup" module: hardware scan reveal → recommendation →
 * optional full model list. Used by both the host flow and join-and-share.
 */
export default function PowerSetup({ onBack, onModelChosen }: PowerSetupProps) {
  const [report, setReport] = useState<DiagnoseReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [step, setStep] = useState<'scan' | 'reveal' | 'models'>('scan')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    appApi
      .diagnose()
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The scan is a timed beat: lines resolve one by one regardless of how fast
  // the diagnosis actually was — the pause is the product.
  useEffect(() => {
    if (step !== 'scan') return
    if (revealed >= SCAN_LINES.length) {
      if (report) {
        const t = setTimeout(() => setStep('reveal'), 500)
        return () => clearTimeout(t)
      }
      return
    }
    // Never reveal the final "Best model" line before the data exists.
    if (revealed === SCAN_LINES.length - 1 && !report && !error) return
    const t = setTimeout(() => setRevealed((n) => n + 1), SCAN_BEAT_MS)
    return () => clearTimeout(t)
  }, [step, revealed, report, error])

  if (error) {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-4 px-8">
        <BackButton onClick={onBack} />
        <p className="text-bad">We couldn&rsquo;t check this Mac: {error}</p>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
      </div>
    )
  }

  const hw = report?.hardware
  const scanValue = (line: (typeof SCAN_LINES)[number]): string => {
    if (!report) return 'measuring...'
    switch (line) {
      case 'Chip':
        return hw?.gpu_name ?? 'Unknown'
      case 'AI memory':
        return hw?.vram_display ?? '—'
      case 'Free disk':
        return '—' // PoC: disk check arrives with download errors instead
      case 'Best model':
        return report.recommended?.name ?? '—'
    }
  }

  if (step === 'scan') {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-10"
        data-testid="scan-screen"
      >
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span className="absolute h-full w-full animate-ping rounded-full border border-accent/30" />
          <span className="absolute h-2/3 w-2/3 rounded-full border border-accent/40" />
          <span className="font-mono text-2xl text-accent" aria-hidden>
            &#9671;
          </span>
        </div>
        <h1 className="text-[28px] font-bold tracking-tight" aria-live="polite">
          Checking your Mac...
        </h1>
        <div className="flex flex-col gap-2 font-mono text-[14px]">
          {SCAN_LINES.map((line, i) => (
            <div
              key={line}
              className={`flex gap-2 transition-opacity ${i < revealed ? 'opacity-100' : 'opacity-25'}`}
            >
              <span className={i < revealed ? 'text-good' : 'text-ink-faint'}>
                {i < revealed ? '+' : '>'}
              </span>
              <span className="w-28 text-ink-muted">{line}</span>
              <span
                className="text-ink"
                data-testid={`scan-${line.replace(' ', '-').toLowerCase()}`}
              >
                {i < revealed ? scanValue(line) : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!report) return null
  const recommended = report.catalog.find((m) => m.recommended) ?? report.catalog[0]

  if (step === 'reveal') {
    return (
      <div
        className="relative flex h-screen flex-col items-center justify-center gap-6 px-8"
        data-testid="reveal-screen"
      >
        <BackButton onClick={onBack} />
        <h1 className="text-[28px] font-bold tracking-tight">
          Nice machine. Here&rsquo;s what it can do.
        </h1>
        <div className="rounded-full border border-edge bg-panel px-5 py-2 font-mono text-[13px] text-ink-muted">
          {hw?.gpu_name} &middot; {hw?.vram_display} AI memory
        </div>
        <div
          className="w-full max-w-xl rounded-(--radius-card) border border-edge bg-panel p-6"
          data-testid="recommendation-card"
        >
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
              Recommended for this Mac
            </span>
            <FitBadge fit={recommended.fit} />
          </div>
          <div className="mt-3 font-mono text-[22px] font-bold" data-testid="recommended-name">
            {recommended.name}
          </div>
          <p className="mt-2 text-sm text-ink-muted">{recommended.description}</p>
          <p className="mt-4 font-mono text-[12px] text-ink-faint">
            Download size {recommended.size}
            {recommended.installed && ' · already on this Mac'}
          </p>
        </div>
        <Button data-testid="use-model" onClick={() => onModelChosen(recommended.name, report)}>
          Use this model
        </Button>
        <button
          data-testid="see-options"
          className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          onClick={() => {
            setSelected(recommended.name)
            setStep('models')
          }}
        >
          See other options
        </button>
      </div>
    )
  }

  // step === 'models'
  const choosable = report.catalog.filter((m) => !m.draft)
  return (
    <div
      className="relative flex h-screen flex-col items-center gap-5 px-8 py-14"
      data-testid="models-screen"
    >
      <BackButton onClick={() => setStep('reveal')} />
      <div className="flex w-full max-w-2xl items-baseline justify-between">
        <h1 className="text-[24px] font-bold tracking-tight">Pick a model</h1>
        <span className="font-mono text-[12px] text-ink-faint">
          {hw?.gpu_name} &middot; {hw?.vram_display} AI memory
        </span>
      </div>
      <div className="w-full max-w-2xl grow overflow-y-auto rounded-(--radius-card) border border-edge">
        {choosable.map((m) => {
          const disabled = m.fit === 'too_large'
          return (
            <button
              key={m.name}
              data-testid={`model-row-${m.name}`}
              disabled={disabled}
              onClick={() => setSelected(m.name)}
              className={`flex w-full flex-col gap-1 border-b border-edge bg-panel p-4 text-left last:border-b-0 ${
                disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-inset'
              } ${selected === m.name ? 'bg-inset' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full border ${
                    selected === m.name ? 'border-accent bg-accent' : 'border-ink-faint'
                  }`}
                  aria-hidden
                />
                <span className="font-mono text-[14px] font-semibold">{m.name}</span>
                {m.recommended && (
                  <span className="rounded-full border border-accent/50 px-2 py-0.5 text-[11px] text-accent">
                    Recommended
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3">
                  <FitBadge fit={m.fit} />
                  <span className="w-16 text-right font-mono text-[12px] text-ink-faint">
                    {m.size}
                  </span>
                </span>
              </div>
              <p className="pl-6 text-[13px] text-ink-muted">
                {disabled
                  ? `Needs about ${m.size} of AI memory — this Mac has ${hw?.vram_display}.`
                  : m.description}
              </p>
            </button>
          )
        })}
      </div>
      <Button
        data-testid="models-continue"
        disabled={!selected}
        onClick={() => selected && onModelChosen(selected, report)}
      >
        Continue
      </Button>
    </div>
  )
}
