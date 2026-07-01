import { Button } from '../components/ui'
import { CopyButton, InviteQr } from '../components/InvitePanel'

interface MeshLiveProps {
  token: string | null
  model: string | null
  isPrivate: boolean
  onGoToChat: () => void
}

export default function MeshLive({ token, model, isPrivate, onGoToChat }: MeshLiveProps) {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-6 px-8"
      data-testid="mesh-live-screen"
    >
      <div className="text-center">
        <h1 className="text-[32px] font-bold tracking-tight">Your mesh is live.</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          {model ?? 'Your model'} is running on this Mac. Now invite someone.
        </p>
      </div>

      {token ? (
        <div className="animate-[qr-in_400ms_ease-out]">
          <InviteQr token={token} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Fetching your invite code…</p>
      )}

      <p className="text-sm text-ink-muted">
        Scan with a phone, or send the code any way you like.
      </p>

      <div className="flex items-center gap-3">
        {token && <CopyButton text={token} />}
        <Button data-testid="go-to-chat" onClick={onGoToChat}>
          Go to chat &rarr;
        </Button>
      </div>

      <p className="text-[13px] text-ink-faint">
        Anyone who joins can chat with your model. {isPrivate ? 'Invite-only.' : 'Open mesh.'}
      </p>
    </div>
  )
}
