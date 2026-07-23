import { Home, MessageSquare, Settings } from 'lucide-react'
import MeshMark from './MeshMark'

interface AppNavigationProps {
  current: 'home' | 'chat'
  connected: boolean
  meshName?: string
  isPublic?: boolean
  onHome: () => void
  onChat: () => void
  onSettings: () => void
}

export default function AppNavigation({
  current,
  connected,
  meshName,
  isPublic,
  onHome,
  onChat,
  onSettings,
}: AppNavigationProps) {
  return (
    <header
      className="flex h-12 shrink-0 items-center border-b border-edge bg-panel px-4"
      data-testid="app-navigation"
    >
      <div className="mr-6 flex items-center gap-2 font-mono text-sm font-semibold text-accent">
        <MeshMark size={17} />
        Mesh
      </div>
      <nav className="flex h-full items-center gap-1" aria-label="Main navigation">
        <NavButton active={current === 'home'} onClick={onHome} icon={Home} testId="nav-home">
          Home
        </NavButton>
        <NavButton
          active={current === 'chat'}
          onClick={onChat}
          icon={MessageSquare}
          testId="nav-chat"
          disabled={!connected}
        >
          Chat
        </NavButton>
      </nav>
      {connected && (
        <button
          onClick={onChat}
          className="ml-auto flex min-w-0 items-center gap-2 rounded-full border border-edge bg-inset px-3 py-1.5 text-[11px] text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
          title="Return to the active mesh"
          data-testid="nav-connection"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-good" aria-hidden />
          <span className="max-w-[260px] truncate">{meshName ?? 'Connected mesh'}</span>
          <span className="text-ink-faint">· {isPublic ? 'Public' : 'Private'}</span>
        </button>
      )}
      <button
        data-testid="nav-settings"
        onClick={onSettings}
        className={`${connected ? 'ml-2' : 'ml-auto'} rounded-(--radius-control) p-2 text-ink-muted transition-colors hover:bg-inset hover:text-ink`}
        aria-label="Settings"
        title="Settings"
      >
        <Settings size={15} aria-hidden />
      </button>
    </header>
  )
}

function NavButton({
  active,
  onClick,
  icon: Icon,
  testId,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Home
  testId: string
  disabled?: boolean
  children: string
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-full items-center gap-1.5 border-b-2 px-3 text-[12px] font-medium transition-colors disabled:opacity-35 ${
        active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      <Icon size={13} aria-hidden />
      {children}
    </button>
  )
}
