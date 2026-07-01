import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { streamChat } from '../lib/api'
import type { ChatMessage } from '../lib/types'

const STARTERS = [
  'Plan a week of dinners',
  "Explain something to me like I'm five",
  'Help me write a tricky email',
]

interface ChatProps {
  models: Array<{ id: string; label: string; local: boolean }>
  selectedModel: string | null
  onSelectModel: (id: string) => void
  hostname?: string
  onStreamingChange?: (streaming: boolean) => void
}

/** Split inline `<think>…</think>` blocks (small reasoning models emit these
 *  in output_text) away from the visible answer. */
function splitThinking(raw: string): { thinking: string; answer: string } {
  if (!raw.startsWith('<think>')) return { thinking: '', answer: raw }
  const end = raw.indexOf('</think>')
  if (end === -1) return { thinking: raw.slice(7), answer: '' }
  return { thinking: raw.slice(7, end).trim(), answer: raw.slice(end + 8).replace(/^\s+/, '') }
}

export default function Chat({
  models,
  selectedModel,
  onSelectModel,
  hostname,
  onStreamingChange,
}: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rawRef = useRef('')
  const idSeq = useRef(0)

  useEffect(() => {
    onStreamingChange?.(streaming)
  }, [streaming, onStreamingChange])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (text: string) => {
    const prompt = text.trim()
    if (!prompt || streaming || !selectedModel) return
    setInput('')
    const userMsg: ChatMessage = { id: `u-${++idSeq.current}`, role: 'user', text: prompt }
    const asstId = `a-${++idSeq.current}`
    const history = [...messages, userMsg]
    setMessages([...history, { id: asstId, role: 'assistant', text: '', streaming: true }])
    setStreaming(true)
    rawRef.current = ''

    const update = (patch: Partial<ChatMessage>) =>
      setMessages((msgs) => msgs.map((m) => (m.id === asstId ? { ...m, ...patch } : m)))

    const abort = new AbortController()
    abortRef.current = abort
    try {
      await streamChat(
        selectedModel,
        history.map((m) => ({ role: m.role, content: m.text })),
        {
          onDelta: (delta) => {
            rawRef.current += delta
            const { thinking, answer } = splitThinking(rawRef.current)
            update({ text: answer, thinking })
          },
          onReasoningDelta: (delta) => {
            update({
              thinking: (rawRef.current ? splitThinking(rawRef.current).thinking : '') + delta,
            })
          },
          onCompleted: (info) => update({ completed: info, streaming: false }),
          onError: (message) => update({ error: message, streaming: false }),
        },
        abort.signal,
      )
    } catch (err) {
      if (!abort.signal.aborted) update({ error: String(err), streaming: false })
    } finally {
      update({ streaming: false })
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  const selectedMeta = models.find((m) => m.id === selectedModel)

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* top bar */}
      <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
        <label className="text-sm text-ink-muted" htmlFor="model-picker">
          Model:
        </label>
        <select
          id="model-picker"
          data-testid="model-picker"
          value={selectedModel ?? ''}
          onChange={(e) => onSelectModel(e.target.value)}
          className="rounded-(--radius-control) border border-edge bg-inset px-3 py-1.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
        >
          {models.length === 0 && <option value="">No models yet</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {selectedMeta && (
          <span className="text-[12px] text-ink-faint">
            · running on {selectedMeta.local ? 'this Mac' : 'the mesh'}
          </span>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="grow overflow-y-auto px-6 py-6" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-[22px] font-bold">Say hello.</h2>
            <p className="max-w-sm text-sm text-ink-muted">
              Your message goes straight to{' '}
              <span className="font-mono">{selectedMeta?.label ?? 'the model'}</span>
              {selectedMeta?.local ? ' running on this Mac' : ' on your mesh'} — no cloud in
              between.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-full border border-edge bg-panel px-4 py-1.5 text-[13px] text-ink-muted hover:border-accent/60 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div
                  key={m.id}
                  className="self-end rounded-(--radius-card) bg-inset px-4 py-3 text-[15px]"
                >
                  {m.text}
                </div>
              ) : (
                <AssistantBubble
                  key={m.id}
                  msg={m}
                  modelLabel={selectedMeta?.label}
                  hostname={hostname}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-edge px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            data-testid="chat-input"
            value={input}
            rows={1}
            placeholder="Ask anything…"
            aria-label="Prompt"
            disabled={models.length === 0}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
              if (e.key === 'Escape' && streaming) stop()
            }}
            className="max-h-40 grow resize-none rounded-(--radius-card) border border-edge bg-inset px-4 py-3 text-[15px] outline-none focus:border-accent"
          />
          {streaming ? (
            <button
              data-testid="chat-stop"
              onClick={stop}
              className="rounded-(--radius-control) border border-edge bg-panel px-4 py-3 text-sm hover:border-bad/60"
              aria-label="Stop"
            >
              ■ Stop
            </button>
          ) : (
            <button
              data-testid="chat-send"
              onClick={() => void send(input)}
              disabled={!input.trim() || !selectedModel}
              className="rounded-(--radius-control) bg-accent px-4 py-3 text-sm font-bold text-[#06222e] disabled:opacity-40"
              aria-label="Send"
            >
              ↑
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[12px] text-ink-faint">
          Private to your mesh · end-to-end encrypted
        </p>
      </div>
    </div>
  )
}

function AssistantBubble({
  msg,
  modelLabel,
  hostname,
}: {
  msg: ChatMessage
  modelLabel?: string
  hostname?: string
}) {
  const [showThinking, setShowThinking] = useState(false)
  const tokPerSec = (() => {
    const out = msg.completed?.usage?.output_tokens
    const ms = msg.completed?.timings?.decode_time_ms
    if (!out || !ms) return null
    return Math.round((out / ms) * 1000)
  })()
  const servedBy = msg.completed?.served_by

  return (
    <div
      className="self-start rounded-(--radius-card) border border-edge bg-panel px-4 py-3"
      data-testid="assistant-message"
    >
      <div className="mb-1 font-mono text-[11px] text-ink-faint">
        {modelLabel ?? 'model'}
        {servedBy ? ` · via ${servedBy === hostname ? 'this Mac' : servedBy}` : ''}
      </div>
      {msg.thinking && (
        <button
          onClick={() => setShowThinking((s) => !s)}
          className="mb-2 text-[12px] text-ink-faint italic hover:text-ink-muted"
          data-testid="thinking-toggle"
        >
          {showThinking ? '▾ thinking' : '▸ thinking…'}
        </button>
      )}
      {msg.thinking && showThinking && (
        <p className="mb-3 border-l-2 border-edge pl-3 text-[13px] whitespace-pre-wrap text-ink-faint">
          {msg.thinking}
        </p>
      )}
      <div className="prose-mesh text-[15px] leading-relaxed" data-testid="assistant-text">
        <ReactMarkdown>{msg.text}</ReactMarkdown>
        {msg.streaming && <span className="animate-pulse font-mono">▍</span>}
      </div>
      {msg.error && <p className="mt-2 text-[13px] text-bad">{msg.error}</p>}
      {tokPerSec !== null && (
        <div
          className="mt-2 font-mono text-[11px] text-ink-faint"
          title={`${tokPerSec} tokens per second — how fast the model writes`}
        >
          {tokPerSec} tok/s
        </div>
      )}
    </div>
  )
}
