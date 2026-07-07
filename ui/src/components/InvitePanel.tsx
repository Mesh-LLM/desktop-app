import { Check, Copy, Link2, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'

/** The public landing page that bounces an invite into the app via the
 *  mesh:// deep link. The token rides in the URL fragment, which never
 *  leaves the browser — the page is static and reads location.hash only. */
export function inviteLink(token: string): string {
  return `https://mesh-llm.github.io/desktop-app/join/#${token}`
}

export function CopyButton({
  text,
  label = 'Copy invite code',
  icon: Icon = Copy,
  testId = 'copy-invite',
  variant = 'quiet',
}: {
  text: string
  label?: string
  icon?: typeof Copy
  testId?: string
  variant?: 'quiet' | 'primary'
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const styles =
    variant === 'primary'
      ? 'bg-accent text-accent-ink hover:bg-accent-hover'
      : 'border border-edge bg-panel hover:border-accent/60'
  return (
    <button
      data-testid={testId}
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
      }}
      className={`inline-flex items-center gap-2 rounded-(--radius-control) px-5 py-2.5 text-sm font-semibold transition-colors ${styles}`}
    >
      {copied ? <Check size={14} aria-hidden /> : <Icon size={14} aria-hidden />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function InviteQr({ token, size = 280 }: { token: string; size?: number }) {
  if (token.length > 2900) {
    return (
      <p className="max-w-sm text-center text-sm text-ink-muted" data-testid="qr-too-long">
        This invite code is too long for a QR code — use the copy button instead.
      </p>
    )
  }
  return (
    <div className="rounded-(--radius-card) bg-white p-4" data-testid="invite-qr">
      <QRCodeSVG value={token} size={size} level={token.length > 1200 ? 'L' : 'M'} />
    </div>
  )
}

interface InviteModalProps {
  token: string
  isPrivate: boolean
  onClose: () => void
  justJoined?: string | null
}

export function InviteModal({ token, isPrivate, onClose, justJoined }: InviteModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      data-testid="invite-modal"
    >
      <div
        className="flex w-[440px] flex-col items-center gap-4 rounded-(--radius-card) border border-edge bg-panel p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between">
          <h2 className="text-[18px] font-bold">Invite someone</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted transition-colors hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* The link is the hero: one click on any machine with Mesh installed
            opens the app straight into this mesh's join flow. */}
        <div className="flex w-full flex-col items-center gap-2 rounded-(--radius-card) border border-accent/40 bg-accent/[0.06] p-4">
          <p className="text-center text-sm text-ink">
            Send this link — clicking it opens Mesh and joins them in one step.
          </p>
          <CopyButton
            text={inviteLink(token)}
            label="Copy invite link"
            icon={Link2}
            testId="copy-invite-link"
            variant="primary"
          />
        </div>

        <InviteQr token={token} size={210} />
        <p className="text-center text-sm text-ink-muted">
          Or scan with a phone camera — or copy the raw code below.
        </p>
        <div className="flex w-full items-center gap-2">
          <span className="grow truncate rounded-(--radius-control) bg-inset px-3 py-2 font-mono text-[11px] text-ink-faint">
            {token.slice(0, 28)}…
          </span>
          <CopyButton text={token} label="Copy code" />
        </div>
        {justJoined && (
          <p
            className="flex items-center gap-1.5 text-sm text-good"
            data-testid="invite-just-joined"
          >
            <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
            {justJoined} just joined
          </p>
        )}
        <p className="text-center text-[12px] text-ink-faint">
          New members can chat with every model on this mesh.{' '}
          {isPrivate ? 'Invite-only.' : 'Open mesh.'}
        </p>
      </div>
    </div>
  )
}
