import { useEffect, useState } from 'react'
import MeshViz from '../components/MeshViz'
import { Card, ReassuranceLine } from '../components/ui'
import { looksLikeInviteToken } from '../lib/api'

interface WelcomeProps {
  onJoin: (prefillToken?: string) => void
  onHost: () => void
}

export default function Welcome({ onJoin, onHost }: WelcomeProps) {
  const [clipboardToken, setClipboardToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (!cancelled && looksLikeInviteToken(text)) setClipboardToken(text.trim())
      } catch {
        /* clipboard permission denied — fine */
      }
    }
    void check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [])

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden">
      <MeshViz variant="ambient" className="absolute inset-0 h-full w-full opacity-60" />
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-8 px-8">
        <div className="flex items-center gap-2 font-mono text-lg text-accent">
          <span aria-hidden>&#9671;</span> mesh
        </div>
        <div className="text-center">
          <h1 className="text-[32px] leading-tight font-bold tracking-tight">
            Your own AI. On your own machines.
          </h1>
          <p className="mt-3 text-[15px] text-ink-muted">
            Chat with a powerful AI that runs on Macs you and your people own — not in someone
            else&rsquo;s cloud.
          </p>
        </div>

        {clipboardToken && (
          <button
            data-testid="clipboard-invite-pill"
            onClick={() => onJoin(clipboardToken)}
            className="rounded-full border border-accent/50 bg-panel px-4 py-1.5 text-[13px] text-ink-muted transition-colors hover:border-accent"
          >
            We spotted an invite code in your clipboard —{' '}
            <span className="font-semibold text-accent">Use it</span>
          </button>
        )}

        <div className="grid w-full grid-cols-2 gap-4">
          <Card data-testid="welcome-join" onClick={() => onJoin()}>
            <div className="text-[17px] font-semibold">Join a mesh</div>
            <p className="mt-2 text-sm text-ink-muted">
              Someone sent you an invite code? Start here.
            </p>
            <div className="mt-4 text-right text-accent" aria-hidden>
              &rarr;
            </div>
          </Card>
          <Card data-testid="welcome-host" onClick={onHost}>
            <div className="text-[17px] font-semibold">Start my own mesh</div>
            <p className="mt-2 text-sm text-ink-muted">
              Put this Mac&rsquo;s power to work and invite others in.
            </p>
            <div className="mt-4 text-right text-accent" aria-hidden>
              &rarr;
            </div>
          </Card>
        </div>

        <ReassuranceLine />
      </div>
    </div>
  )
}
