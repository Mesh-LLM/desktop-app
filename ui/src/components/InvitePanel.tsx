import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'

export function CopyButton({ text, label = 'Copy invite code' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      data-testid="copy-invite"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
      }}
      className="rounded-(--radius-control) border border-edge bg-panel px-5 py-2.5 text-sm font-semibold transition-colors hover:border-accent/60"
    >
      {copied ? 'Copied ✓' : label}
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
        className="flex w-[420px] flex-col items-center gap-4 rounded-(--radius-card) border border-edge bg-panel p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between">
          <h2 className="text-[18px] font-bold">Invite someone</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink">
            ✕
          </button>
        </div>
        <InviteQr token={token} size={240} />
        <p className="text-center text-sm text-ink-muted">
          Scan with a phone camera, or copy the code and send it however you like.
        </p>
        <div className="flex w-full items-center gap-2">
          <span className="grow truncate rounded-(--radius-control) bg-inset px-3 py-2 font-mono text-[11px] text-ink-faint">
            {token.slice(0, 28)}…
          </span>
          <CopyButton text={token} label="Copy code" />
        </div>
        {justJoined && (
          <p className="text-sm text-good" data-testid="invite-just-joined">
            ● {justJoined} just joined
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
