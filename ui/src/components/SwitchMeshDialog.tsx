import { ArrowRightLeft, X } from 'lucide-react'
import { Button } from './ui'

interface SwitchMeshDialogProps {
  currentName: string
  destination: string
  onCancel: () => void
  onConfirm: () => void
}

export default function SwitchMeshDialog({
  currentName,
  destination,
  onCancel,
  onConfirm,
}: SwitchMeshDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-mesh-title"
      data-testid="switch-mesh-dialog"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-(--radius-card) border border-edge bg-panel p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-(--radius-control) border border-accent/40 bg-accent/10 p-2 text-accent">
            <ArrowRightLeft size={18} aria-hidden />
          </div>
          <div className="min-w-0 grow">
            <h2 id="switch-mesh-title" className="text-lg font-bold">
              Switch meshes?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              This Mac is connected to <strong className="text-ink">{currentName}</strong>. To use{' '}
              <strong className="text-ink">{destination}</strong>, Mesh will disconnect the current
              node and connect the new one.
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel switch"
            className="text-ink-faint hover:text-ink"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
        <p className="mt-4 rounded-(--radius-control) bg-inset px-3 py-2 text-[11px] text-ink-faint">
          Your local chats stay saved and will still be here after the switch.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button data-testid="switch-mesh-confirm" onClick={onConfirm}>
            Switch mesh
          </Button>
        </div>
      </div>
    </div>
  )
}
