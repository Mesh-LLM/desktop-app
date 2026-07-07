import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui'

/**
 * The setup-failure screen: full error text in a scrollable, selectable
 * monospace box with a copy button — errors from the native runtime layer
 * (dlopen chains, download failures) run long and users need to paste them
 * into an issue verbatim.
 */
export default function ErrorScreen({
  message,
  onReset,
}: {
  message: string
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-6 px-8"
      data-testid="error-screen"
    >
      <h1 className="font-display text-[26px] font-bold tracking-tight">Something went wrong.</h1>
      <div className="w-full max-w-2xl">
        <pre
          data-testid="error-message"
          className="max-h-[45vh] overflow-y-auto rounded-(--radius-card) border border-edge bg-panel p-4 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap text-ink-muted select-text"
        >
          {message}
        </pre>
        <div className="mt-2 flex justify-end">
          <button
            data-testid="error-copy"
            onClick={() => {
              void navigator.clipboard.writeText(message)
              setCopied(true)
            }}
            className="flex items-center gap-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink"
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? 'Copied' : 'Copy error'}
          </button>
        </div>
      </div>
      <div className="flex gap-3">
        <Button data-testid="error-retry" onClick={onReset}>
          Start over
        </Button>
      </div>
    </div>
  )
}
