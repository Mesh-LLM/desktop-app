import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { FitCode } from '../lib/types'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  const base =
    'rounded-(--radius-control) px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-accent text-[#06222e] hover:bg-[#6ad0f0]',
    quiet: 'border border-edge bg-panel text-ink hover:border-accent/60',
    ghost: 'text-ink-muted hover:text-ink',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

export function Card({
  selected,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; children: ReactNode }) {
  return (
    <button
      className={`rounded-(--radius-card) border bg-panel p-6 text-left transition-all hover:border-accent/70 focus-visible:outline-2 focus-visible:outline-accent ${
        selected ? 'border-accent' : 'border-edge'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const FIT_LABELS: Record<FitCode, { label: string; cls: string; symbol: string }> = {
  comfortable: { label: 'Comfortable', cls: 'text-good border-good/40', symbol: '*' },
  tight: { label: 'Snug', cls: 'text-warn border-warn/40', symbol: '~' },
  tradeoff: { label: 'Runs slower', cls: 'text-warn border-warn/40', symbol: '~' },
  too_large: { label: 'Too big', cls: 'text-bad border-bad/40', symbol: 'x' },
}

export function FitBadge({ fit }: { fit: FitCode }) {
  const f = FIT_LABELS[fit]
  return (
    <span
      data-testid="fit-badge"
      data-fit={fit}
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${f.cls}`}
    >
      {f.symbol} {f.label}
    </span>
  )
}

export function ReassuranceLine({ text }: { text?: string }) {
  return (
    <p className="flex items-center justify-center gap-2 text-[13px] text-ink-faint">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {text ?? 'Everything stays between your devices — end-to-end encrypted.'}
    </p>
  )
}

export function ProgressBar({ pct }: { pct: number | null }) {
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-inset"
      role="progressbar"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {pct === null ? (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/70" />
      ) : (
        <div
          className="h-full rounded-full bg-accent shadow-[0_0_12px_rgba(76,194,232,0.6)] transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      )}
    </div>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-5 left-5 text-sm text-ink-muted transition-colors hover:text-ink"
      aria-label="Back"
    >
      &larr; Back
    </button>
  )
}
