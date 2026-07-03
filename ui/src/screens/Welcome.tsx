import { useEffect, useState } from 'react'
import MeshViz from '../components/MeshViz'
import { Card, ReassuranceLine } from '../components/ui'
import { looksLikeInviteToken } from '../lib/api'

interface WelcomeProps {
  onJoinPublic: () => void
  onJoin: (prefillToken?: string) => void
  onHost: () => void
}

export default function Welcome({ onJoinPublic, onJoin, onHost }: WelcomeProps) {
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
            A powerful AI that runs on computers you own — not in someone else&rsquo;s cloud. Pool
            more computers to make it smarter.
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

        {/* The hero: THE global mesh. */}
        <button
          data-testid="welcome-public"
          onClick={onJoinPublic}
          className="group relative w-full overflow-hidden rounded-(--radius-card) border border-accent/60 bg-accent/[0.07] p-6 text-left transition-all hover:border-accent hover:bg-accent/[0.12] focus-visible:outline-2 focus-visible:outline-accent"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden>&#127760;</span>
            <span className="text-[11px] font-semibold tracking-wider text-accent uppercase">
              Join the global mesh
            </span>
          </div>
          <div className="mt-2 text-[22px] font-bold tracking-tight">One worldwide AI mesh.</div>
          <p className="mt-2 max-w-lg text-sm text-ink-muted">
            Thousands of machines of every size, pooling their compute and a whole variety of expert
            models — always on, no account, end-to-end encrypted. You can be part of it.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-accent">
            Join now
            <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
              &rarr;
            </span>
          </div>
        </button>

        {/* Secondary front doors. */}
        <div className="grid w-full grid-cols-2 gap-4">
          <Card data-testid="welcome-join" onClick={() => onJoin()}>
            <div className="text-[15px] font-semibold">Join with an invite code</div>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              Someone sent you a code for their private mesh.
            </p>
          </Card>
          <Card data-testid="welcome-host" onClick={onHost}>
            <div className="text-[15px] font-semibold">Start your own mesh</div>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              A private mesh for you and the people you invite. The more you invite, the smarter the
              mesh gets.
            </p>
          </Card>
        </div>

        <ReassuranceLine />
      </div>
    </div>
  )
}
