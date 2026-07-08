import { useEffect, useRef, useState } from 'react'
import { BackButton, Button, Card, ReassuranceLine } from '../components/ui'
import { looksLikeInviteToken } from '../lib/api'

interface JoinFlowProps {
  prefillToken?: string
  onBack: () => void
  /** share=true routes through Power Setup before joining. */
  onSubmit: (token: string, share: boolean) => void
}

export default function JoinFlow({ prefillToken, onBack, onSubmit }: JoinFlowProps) {
  const [step, setStep] = useState<'token' | 'mode'>('token')
  const [token, setToken] = useState(prefillToken ?? '')
  const [touched, setTouched] = useState(Boolean(prefillToken))
  const [share, setShare] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [step])

  const valid = looksLikeInviteToken(token)
  const showInvalid = touched && token.trim().length > 0 && !valid

  if (step === 'token') {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center px-8">
        <BackButton onClick={onBack} />
        <div className="flex w-full max-w-xl flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="font-display text-[28px] font-bold tracking-tight">
              Paste your invite code
            </h1>
            <p className="mt-2 text-[15px] text-ink-muted">
              It&rsquo;s the long jumble of letters your friend sent you.
            </p>
          </div>
          <textarea
            ref={inputRef}
            data-testid="invite-input"
            value={token}
            rows={4}
            spellCheck={false}
            onChange={(e) => {
              setToken(e.target.value)
              setTouched(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && valid) {
                e.preventDefault()
                setStep('mode')
              }
            }}
            className={`w-full resize-none rounded-(--radius-card) border bg-inset p-4 font-mono text-[13px] break-all text-ink outline-none focus:border-accent ${
              showInvalid ? 'border-bad' : valid ? 'border-good' : 'border-edge'
            }`}
            placeholder="mshv1-eyJub2RlIjoi..."
            aria-label="Invite code"
          />
          {valid && (
            <p data-testid="invite-valid" className="text-[13px] text-good">
              Looks good — this code checks out.
            </p>
          )}
          {showInvalid && (
            <p data-testid="invite-invalid" className="text-[13px] text-bad">
              Hmm, that doesn&rsquo;t look like an invite code. Ask your friend to copy the whole
              thing — it&rsquo;s long.
            </p>
          )}
          <Button data-testid="invite-continue" disabled={!valid} onClick={() => setStep('mode')}>
            Continue
          </Button>
          <ReassuranceLine text="Your connection will be end-to-end encrypted." />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-center px-8">
      <BackButton onClick={() => setStep('token')} />
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="font-display text-[28px] font-bold tracking-tight">
            How do you want to take part?
          </h1>
          <p className="mt-2 text-[15px] text-ink-muted">You can change this any time later.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-4">
          <Card data-testid="mode-chat" selected={!share} onClick={() => setShare(false)}>
            <div className="text-[16px] font-semibold">Just chat</div>
            <p className="mt-2 text-sm text-ink-muted">
              Use the AI already running on other machines in the mesh. Nothing runs on this Mac.
            </p>
            <p className="mt-4 font-mono text-[12px] text-ink-faint">Ready in seconds</p>
          </Card>
          <Card data-testid="mode-share" selected={share} onClick={() => setShare(true)}>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold">Chat + share this Mac&rsquo;s power</span>
              <span className="rounded-full border border-accent/50 px-2 py-0.5 text-[11px] text-accent">
                Recommended
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Your Mac also runs an AI model that everyone in the mesh can use. The mesh gets
              stronger.
            </p>
            <p className="mt-4 font-mono text-[12px] text-ink-faint">
              Takes a few minutes to set up
            </p>
          </Card>
        </div>
        <Button data-testid="mode-continue" onClick={() => onSubmit(token.trim(), share)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
