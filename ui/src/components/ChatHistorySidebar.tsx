import { Archive, MessageSquare, PencilLine, Plus } from 'lucide-react'
import type { ChatSessionSummary } from '../lib/chat-sessions'

interface ChatHistorySidebarProps {
  sessions: ChatSessionSummary[]
  activeId: string | null
  streaming: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onArchive: (id: string, archived: boolean) => void
}

export default function ChatHistorySidebar({
  sessions,
  activeId,
  streaming,
  onSelect,
  onNew,
  onArchive,
}: ChatHistorySidebarProps) {
  const visible = sessions.filter((session) => !session.archived && session.message_count > 0)
  const activeDraft = sessions.find(
    (session) => session.id === activeId && !session.archived && session.message_count === 0,
  )

  return (
    <aside
      className="flex w-[248px] shrink-0 flex-col border-r border-edge bg-panel"
      data-testid="chat-sidebar"
    >
      <div className="flex items-center justify-between border-b border-edge px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare size={15} className="text-accent" aria-hidden />
          Chats
        </div>
        <button
          data-testid="chat-new"
          onClick={onNew}
          disabled={streaming}
          className="rounded-(--radius-control) p-1.5 text-ink-muted hover:bg-inset hover:text-ink disabled:opacity-40"
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>
      <nav className="min-h-0 grow overflow-y-auto p-2" aria-label="Chats">
        {activeDraft && <DraftRow />}
        {visible.length === 0 && !activeDraft ? (
          <p className="px-3 py-4 text-[12px] text-ink-faint">Start a chat to see it here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {visible.map((session) => (
              <ChatRow
                key={session.id}
                session={session}
                selected={session.id === activeId}
                streaming={streaming}
                onSelect={onSelect}
                onArchive={onArchive}
              />
            ))}
          </ul>
        )}
      </nav>
      <div className="border-t border-edge p-3 text-[10px] leading-relaxed text-ink-faint">
        Right-click or use the archive action to move a chat into Settings.
      </div>
    </aside>
  )
}

function DraftRow() {
  return (
    <div
      data-testid="chat-draft"
      className="mb-1 flex items-center gap-2 rounded-(--radius-control) bg-inset px-3 py-2.5 text-ink"
    >
      <PencilLine size={12} className="text-accent" aria-hidden />
      <span className="text-[12px] font-medium">New chat</span>
    </div>
  )
}

function ChatRow({
  session,
  selected,
  streaming,
  onSelect,
  onArchive,
}: {
  session: ChatSessionSummary
  selected: boolean
  streaming: boolean
  onSelect: (id: string) => void
  onArchive: (id: string, archived: boolean) => void
}) {
  const title = session.title || session.name || 'Chat'
  return (
    <li className="group relative">
      <button
        data-testid="chat-session"
        data-active={selected}
        disabled={streaming && !selected}
        onClick={() => onSelect(session.id)}
        onContextMenu={(event) => {
          event.preventDefault()
          if (!streaming) onArchive(session.id, true)
        }}
        className={`w-full rounded-(--radius-control) px-3 py-2.5 pr-9 text-left transition-colors disabled:opacity-40 ${selected ? 'bg-inset text-ink' : 'text-ink-muted hover:bg-inset/60 hover:text-ink'}`}
      >
        <span className="flex items-center gap-2">
          <PencilLine
            size={12}
            className={selected ? 'text-accent' : 'text-ink-faint'}
            aria-hidden
          />
          <span className="min-w-0 grow truncate text-[12px] font-medium">{title}</span>
        </span>
        <span className="mt-1 block pl-5 text-[10px] text-ink-faint">
          {session.message_count} message{session.message_count === 1 ? '' : 's'} ·{' '}
          {formatDate(session.updated_at)}
        </span>
      </button>
      <button
        data-testid="chat-archive"
        onClick={() => onArchive(session.id, true)}
        disabled={streaming}
        aria-label={`Archive ${title}`}
        title="Archive chat"
        className="absolute top-2 right-2 rounded p-1 text-ink-faint opacity-0 hover:bg-panel hover:text-ink group-hover:opacity-100 focus:opacity-100 disabled:hidden"
      >
        <Archive size={12} aria-hidden />
      </button>
    </li>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || 'now'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
