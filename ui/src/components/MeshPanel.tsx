import {
  Activity,
  BrainCircuit,
  ChevronRight,
  Gauge,
  Laptop,
  Search,
  Server,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { PeerInfo } from '../lib/types'
import MeshMark from './MeshMark'
import MeshViz from './MeshViz'

type DeviceFilter = 'all' | 'nearby' | 'capable'

type MeshDevice = {
  key: string
  name: string
  models: string[]
  latencyMs: number | null
  vramGb: number | null
  self: boolean
  host: boolean
}

const MAX_VISIBLE_DEVICES = 80

interface MeshPanelProps {
  meshName: string
  isPrivate: boolean
  peers: PeerInfo[]
  self: {
    name: string
    serving: boolean
    model: string | null
    vramGb?: number
  }
  streaming: boolean
  token: string | null
  onInvite: () => void
  onStartSharing?: () => void
}

export default function MeshPanel({
  meshName,
  isPrivate,
  peers,
  self,
  streaming,
  token,
  onInvite,
  onStartSharing,
}: MeshPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DeviceFilter>('all')

  const devices = useMemo<MeshDevice[]>(() => {
    const local: MeshDevice = {
      key: 'self',
      name: self.name,
      models: self.serving && self.model ? [self.model] : [],
      latencyMs: 0,
      vramGb: self.vramGb ?? null,
      self: true,
      host: self.serving && Boolean(self.model),
    }
    return [
      local,
      ...peers.map((peer, index) => {
        const models = peer.serving_models ?? peer.hosted_models ?? peer.models ?? []
        return {
          key: peer.node_id ?? peer.id ?? String(index),
          name: peer.hostname ?? `${(peer.node_id ?? peer.id ?? '').slice(0, 8)}…`,
          models,
          latencyMs: peer.latency_ms ?? peer.rtt_ms ?? null,
          vramGb: peer.vram_gb ?? null,
          self: false,
          host: models.length > 0,
        }
      }),
    ]
  }, [peers, self])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return devices
      .filter((device) => {
        if (needle && !`${device.name} ${device.models.join(' ')}`.toLowerCase().includes(needle)) {
          return false
        }
        if (filter === 'nearby') return device.latencyMs !== null && device.latencyMs <= 50
        if (filter === 'capable') return device.host && (device.vramGb ?? 0) >= 16
        return true
      })
      .sort((a, b) => {
        if (a.self !== b.self) return a.self ? -1 : 1
        if (a.host !== b.host) return a.host ? -1 : 1
        if (filter === 'nearby') return (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity)
        if (filter === 'capable') return (b.vramGb ?? 0) - (a.vramGb ?? 0)
        return a.name.localeCompare(b.name)
      })
      .slice(0, MAX_VISIBLE_DEVICES)
  }, [devices, filter, query])

  const hosts = shown.filter((device) => device.host)
  const participants = shown.filter((device) => !device.host)
  const hiddenCount = Math.max(0, devices.length - shown.length)

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-l border-edge bg-panel py-3">
        <button
          data-testid="mesh-expand"
          onClick={() => setCollapsed(false)}
          className="rounded-(--radius-control) p-2 text-ink-muted transition-colors hover:bg-inset hover:text-ink"
          aria-label="Expand mesh"
          title="Expand mesh"
        >
          <ChevronRight size={17} aria-hidden />
        </button>
        <div className="mt-4 text-accent" title={`${devices.length} devices on ${meshName}`}>
          <MeshMark size={20} pulse={streaming} />
        </div>
        <span className="mt-2 font-mono text-[10px] text-ink-faint">{devices.length}</span>
      </aside>
    )
  }

  return (
    <aside
      className="flex w-[320px] shrink-0 flex-col border-l border-edge bg-panel"
      data-testid="mesh-panel"
    >
      <div className="border-b border-edge px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 text-accent">
            <MeshMark size={18} pulse={streaming} />
          </div>
          <div className="min-w-0 grow">
            <div className="truncate text-sm font-semibold" data-testid="mesh-name">
              {meshName}
            </div>
            <div
              className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted"
              data-testid="mesh-status"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden />
              Live · {isPrivate ? 'invite-only' : 'open'}
            </div>
          </div>
          <button
            data-testid="mesh-collapse"
            onClick={() => setCollapsed(true)}
            className="rounded-(--radius-control) p-1.5 text-ink-faint transition-colors hover:bg-inset hover:text-ink"
            aria-label="Collapse mesh"
            title="Collapse mesh"
          >
            <ChevronRight className="rotate-180" size={16} aria-hidden />
          </button>
        </div>

        <MeshViz
          variant="mini"
          peers={Math.min(peers.length, MAX_VISIBLE_DEVICES)}
          streaming={streaming}
          className="mt-3 h-[88px] w-full rounded-(--radius-control) bg-inset"
        />

        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1">
            <Server size={11} aria-hidden /> {devices.filter((d) => d.host).length} hosts
          </span>
          <span className="text-ink-faint">·</span>
          <span className="flex items-center gap-1">
            <UsersRound size={11} aria-hidden /> {devices.filter((d) => !d.host).length}{' '}
            participants
          </span>
        </div>
      </div>

      <div className="border-b border-edge p-3">
        <label className="flex items-center gap-2 rounded-(--radius-control) border border-edge bg-inset px-2.5 py-2 focus-within:border-accent/70">
          <Search size={13} className="text-ink-faint" aria-hidden />
          <input
            data-testid="mesh-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a device or model"
            className="min-w-0 grow bg-transparent text-[12px] outline-none placeholder:text-ink-faint"
          />
        </label>
        <div className="mt-2 flex gap-1" aria-label="Device filter">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            icon={SlidersHorizontal}
          >
            All
          </FilterButton>
          <FilterButton
            active={filter === 'nearby'}
            onClick={() => setFilter('nearby')}
            icon={Gauge}
          >
            Low latency
          </FilterButton>
          <FilterButton
            active={filter === 'capable'}
            onClick={() => setFilter('capable')}
            icon={BrainCircuit}
          >
            Capable
          </FilterButton>
        </div>
      </div>

      <div className="min-h-0 grow overflow-y-auto px-3 py-3">
        <DeviceSection
          title="Hosts"
          count={hosts.length}
          icon={Server}
          empty="No model hosts match this filter."
        >
          {hosts.map((device) => (
            <DeviceRow key={device.key} device={device} />
          ))}
        </DeviceSection>
        <div className="mt-5">
          <DeviceSection
            title="Participants"
            count={participants.length}
            icon={UserRound}
            empty="No passive participants match this filter."
          >
            {participants.map((device) => (
              <DeviceRow key={device.key} device={device} />
            ))}
          </DeviceSection>
        </div>
        {hiddenCount > 0 && (
          <p className="mt-4 rounded-(--radius-control) bg-inset px-3 py-2 text-[11px] leading-relaxed text-ink-faint">
            Showing a focused set of devices. {hiddenCount.toLocaleString()} more are summarized to
            keep Mesh responsive.
          </p>
        )}
      </div>

      <div className="border-t border-edge p-3">
        {onStartSharing && (
          <button
            data-testid="start-sharing"
            onClick={onStartSharing}
            className="mb-2 flex w-full items-center gap-2 rounded-(--radius-control) bg-accent/10 px-3 py-2 text-left text-[12px] font-medium text-accent hover:bg-accent/15"
          >
            <Sparkles size={13} aria-hidden /> Share this Mac’s power
          </button>
        )}
        <div className="flex gap-2">
          <button
            data-testid="invite-button"
            onClick={onInvite}
            disabled={!token}
            className="grow rounded-(--radius-control) border border-accent/50 px-3 py-2 text-[12px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            Invite
          </button>
        </div>
      </div>
    </aside>
  )
}

function FilterButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Activity
  children: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors ${active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-ink-faint hover:text-ink'}`}
    >
      <Icon size={10} aria-hidden /> {children}
    </button>
  )
}

function DeviceSection({
  title,
  count,
  icon: Icon,
  empty,
  children,
}: {
  title: string
  count: number
  icon: typeof Server
  empty: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
        <Icon size={11} aria-hidden />
        <span>{title}</span>
        <span className="ml-auto font-mono">{count}</span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1" data-testid={`${title.toLowerCase()}-list`}>
        {count === 0 ? (
          <p className="px-2 py-3 text-[11px] text-ink-faint italic">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function DeviceRow({ device }: { device: MeshDevice }) {
  const model = device.models[0]
  return (
    <div
      className="rounded-(--radius-control) px-2.5 py-2 hover:bg-inset"
      title={device.models.join(', ')}
    >
      <div className="flex items-center gap-2">
        {device.host ? (
          <Server size={12} className="text-good" aria-hidden />
        ) : (
          <Laptop size={12} className="text-ink-faint" aria-hidden />
        )}
        <span className="min-w-0 grow truncate text-[12px] font-medium">{device.name}</span>
        {device.self && (
          <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">
            YOU
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 pl-5 font-mono text-[10px] text-ink-faint">
        {model ? (
          <span className="min-w-0 grow truncate">{shortModel(model)}</span>
        ) : (
          <span className="grow">chat only</span>
        )}
        {device.vramGb !== null && device.vramGb > 0 && <span>{Math.round(device.vramGb)}GB</span>}
        <span>{formatLatency(device.latencyMs, device.self)}</span>
      </div>
    </div>
  )
}

function formatLatency(latency: number | null, self: boolean): string {
  if (self) return 'local'
  if (latency === null) return '—'
  if (latency > 0 && latency < 1) return '<1ms'
  return `${Math.round(latency)}ms`
}

function shortModel(ref: string): string {
  const tail = ref.split('/').pop() ?? ref
  return tail.replace(/-GGUF.*$/, '').replace(/@.*$/, '')
}
