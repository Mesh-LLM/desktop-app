import { Globe, Lock } from 'lucide-react'
import { useState } from 'react'
import { BackButton, Button, Card, ReassuranceLine } from '../components/ui'
import type { Visibility as Vis } from '../lib/types'

interface VisibilityProps {
  onBack: () => void
  onChosen: (visibility: Vis) => void
}

export default function Visibility({ onBack, onChosen }: VisibilityProps) {
  const [choice, setChoice] = useState<Vis>('private')

  return (
    <div
      className="relative flex h-screen flex-col items-center justify-center gap-8 px-8"
      data-testid="visibility-screen"
    >
      <BackButton onClick={onBack} />
      <h1 className="font-display text-[28px] font-bold tracking-tight">Who can join your mesh?</h1>
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
        <Card
          data-testid="visibility-private"
          selected={choice === 'private'}
          onClick={() => setChoice('private')}
        >
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-accent" aria-hidden />
            <span className="text-[16px] font-semibold">Invite-only</span>
            <span className="rounded-full border border-accent/50 px-2 py-0.5 text-[11px] text-accent">
              Recommended
            </span>
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Only people you send an invite code can join.
          </p>
        </Card>
        <Card
          data-testid="visibility-public"
          selected={choice === 'public'}
          onClick={() => setChoice('public')}
        >
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-accent" aria-hidden />
            <span className="text-[16px] font-semibold">Open</span>
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Your mesh is listed publicly so anyone can find it and join.
          </p>
        </Card>
      </div>
      <ReassuranceLine text="Either way: everything stays between the devices in your mesh — end-to-end encrypted." />
      <Button data-testid="visibility-continue" onClick={() => onChosen(choice)}>
        Continue
      </Button>
    </div>
  )
}
