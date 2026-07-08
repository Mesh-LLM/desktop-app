import { ArrowLeft, Check, Gauge, Lock, X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { FitCode } from '../lib/types'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  const base =
    'rounded-(--radius-control) px-5 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    primary:
      'bg-accent text-accent-ink hover:bg-accent-hover active:scale-[0.98] shadow-[0_0_20px_-6px_var(--color-accent)]',
    quiet: 'border border-edge bg-panel text-ink hover:border-accent/60 active:scale-[0.98]',
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
      className={`rounded-(--radius-card) border bg-panel p-6 text-left transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_8px_30px_-12px_var(--color-accent)] focus-visible:outline-2 focus-visible:outline-accent ${
        selected ? 'border-accent shadow-[0_0_24px_-10px_var(--color-accent)]' : 'border-edge'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const FIT_LABELS: Record<FitCode, { label: string; cls: string; Icon: typeof Check }> = {
  comfortable: { label: 'Comfortable', cls: 'text-good border-good/40', Icon: Check },
  tight: { label: 'Snug', cls: 'text-warn border-warn/40', Icon: Gauge },
  tradeoff: { label: 'Runs slower', cls: 'text-warn border-warn/40', Icon: Gauge },
  too_large: { label: 'Too big', cls: 'text-bad border-bad/40', Icon: X },
}

export function FitBadge({ fit }: { fit: FitCode }) {
  const f = FIT_LABELS[fit]
  return (
    <span
      data-testid="fit-badge"
      data-fit={fit}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${f.cls}`}
    >
      <f.Icon size={11} strokeWidth={2.5} aria-hidden />
      {f.label}
    </span>
  )
}

export function ReassuranceLine({ text }: { text?: string }) {
  return (
    <p className="flex items-center justify-center gap-2 text-[13px] text-ink-faint">
      <Lock size={12} strokeWidth={2.4} aria-hidden />
      {text ?? 'Everything stays between your devices — end-to-end encrypted.'}
    </p>
  )
}

/** Indeterminate wait state — downloads with real byte progress keep the
 *  ProgressBar below. Freezes to a plain ring under prefers-reduced-motion. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Working…"
      data-testid="spinner"
      className={`h-9 w-9 animate-spin rounded-full border-[3px] border-inset border-t-accent ${className}`}
    />
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
          className="h-full rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)] transition-[width] duration-500"
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
      className="absolute top-5 left-5 flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      aria-label="Back"
    >
      <ArrowLeft size={15} strokeWidth={2.2} aria-hidden /> Back
    </button>
  )
}
