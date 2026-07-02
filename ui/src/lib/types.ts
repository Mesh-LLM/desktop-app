// Mirrors src-tauri/src/state.rs and events.rs — the app API contract.

export type Mode = 'host' | 'join'
export type Visibility = 'private' | 'public'

export interface RunningInfo {
  mode: Mode
  visibility: Visibility
  model: string | null
  serving: boolean
  invite_token: string | null
  api_port: number
  console_port: number
  mesh_name: string | null
}

export type Phase =
  | { phase: 'idle' }
  | { phase: 'installing_runtime' }
  | { phase: 'downloading'; model: string }
  | { phase: 'starting'; mode: Mode; model: string | null }
  | ({ phase: 'running' } & RunningInfo)
  | { phase: 'error'; message: string; recoverable: boolean }

export interface DownloadProgress {
  kind: 'model' | 'runtime'
  label: string
  file: string | null
  downloaded_bytes: number | null
  total_bytes: number | null
  status: 'preparing' | 'downloading' | 'done'
  done: boolean
}

export type AppEvent =
  | ({ type: 'phase' } & Phase)
  | ({ type: 'download_progress' } & DownloadProgress)
  | { type: 'node_event'; event: string; detail: Record<string, unknown> }

// ---- diagnose ----

export type FitCode = 'comfortable' | 'tight' | 'tradeoff' | 'too_large'

export interface HardwareReport {
  gpu_name: string | null
  gpu_count: number
  is_soc: boolean
  vram_bytes: number
  vram_gb: number
  vram_display: string
  hostname: string | null
}

export interface CatalogEntry {
  name: string
  file: string
  size: string
  size_gb: number
  description: string
  fit: FitCode
  installed: boolean
  recommended: boolean
  draft: boolean
}

export interface DiagnoseReport {
  hardware: HardwareReport
  recommended: { name: string; reason: string } | null
  catalog: CatalogEntry[]
}

// ---- node management API (subset of StatusPayload we render) ----

export interface PeerInfo {
  node_id?: string
  hostname?: string
  node_state?: string | null
  serving_models?: string[]
  vram_gb?: number
}

export interface StatusPayload {
  node_id?: string
  node_state?: string
  model_name?: string | null
  llama_ready?: boolean
  hostname?: string
  my_hostname?: string
  peers?: PeerInfo[]
  models?: string[]
  serving_models?: string[]
  my_vram_gb?: number
  token?: string
  publication_state?: 'private' | 'public' | 'publish_failed'
  tok_per_sec?: number
}

export interface MeshModel {
  name?: string
  display_name?: string
  status?: 'warm' | 'cold'
  size_gb?: number
  node_count?: number
  active_nodes?: string[]
}

export interface V1Model {
  id: string
  display_name?: string
}

// ---- chat (goose agent turns over /app/chat, Responses-style SSE) ----

export interface ChatTimings {
  ttft_ms?: number
  decode_time_ms?: number
  total_time_ms?: number
}

export interface ChatUsage {
  input_tokens?: number
  output_tokens?: number
}

export interface ChatCompletedInfo {
  model?: string
  served_by?: string
  usage?: ChatUsage
  timings?: ChatTimings
}

/** One agent tool invocation surfaced in the chat (e.g. web_scrape). */
export interface ChatToolCall {
  id: string
  name: string
  status: 'running' | 'done' | 'failed'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls?: ChatToolCall[]
  streaming?: boolean
  error?: string
  completed?: ChatCompletedInfo
}
