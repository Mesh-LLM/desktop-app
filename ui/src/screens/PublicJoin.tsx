import { useState } from 'react'
import { BackButton, Button, Card, ReassuranceLine } from '../components/ui'

interface PublicJoinProps {
  onBack: () => void
  /** Chat-only client: nothing runs on this Mac. */
  onPassive: () => void
  /** Serve a model to the mesh: routes through the hardware check first. */
  onContribute: () => void
}

/**
 * The fork after choosing the global mesh: connect as a chat-only client, or
 * contribute this Mac's power by serving a model. Both stay end-to-end
 * encrypted — the copy leans on that.
 */
export default function PublicJoin({ onBack, onPassive, onContribute }: PublicJoinProps) {
  const [mode, setMode] = useState<'passive' | 'contribute'>('passive')

  return (
    <div
      className="relative flex h-screen flex-col items-center justify-center gap-8 px-8"
      data-testid="public-join-screen"
    >
      <BackButton onClick={onBack} />
      <div className="text-center">
        <h1 className="text-[28px] font-bold tracking-tight">How do you want to join?</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          Both connect you to the same global mesh. You can change this any time.
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
        <Card
          data-testid="public-mode-passive"
          selected={mode === 'passive'}
          onClick={() => setMode('passive')}
        >
          <div className="text-[16px] font-semibold">Just connect</div>
          <p className="mt-2 text-sm text-ink-muted">
            Use the models other machines are already running. Nothing runs on this Mac — no
            download, no load on your hardware.
          </p>
          <p className="mt-4 font-mono text-[12px] text-ink-faint">Ready in seconds</p>
        </Card>
        <Card
          data-testid="public-mode-contribute"
          selected={mode === 'contribute'}
          onClick={() => setMode('contribute')}
        >
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold">Run a model</span>
            <span className="rounded-full border border-accent/50 px-2 py-0.5 text-[11px] text-accent">
              Strengthens the mesh
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            This Mac serves an AI model that everyone in the mesh can use. We&rsquo;ll check what it
            can run first.
          </p>
          <p className="mt-4 font-mono text-[12px] text-ink-faint">Takes a few minutes to set up</p>
        </Card>
      </div>

      <div className="max-w-xl text-center text-[13px] text-ink-faint">
        Either way, there&rsquo;s no account and no cloud in the middle. Your prompts and any model
        you run travel only over end-to-end encrypted connections between machines in the mesh.
      </div>

      <Button
        data-testid="public-continue"
        onClick={() => (mode === 'passive' ? onPassive() : onContribute())}
      >
        Continue
      </Button>
      <ReassuranceLine />
    </div>
  )
}
