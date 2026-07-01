import type { Page } from '@playwright/test'

/**
 * Installs a self-contained mock of the app API + node API inside the page,
 * before any app code runs — the pattern proven by mesh-llm-ui's
 * live-parity.spec.ts (window.fetch shim + MockEventSource). Timings are
 * compressed so full onboarding flows run in ~1s.
 */
export interface MockOptions {
  /** Boot the mock already in the running state (skips onboarding). */
  startRunning?: boolean
}

export async function installMockBackend(page: Page, options: MockOptions = {}) {
  await page.addInitScript((opts: MockOptions) => {
    const TOKEN =
      'eyJpZCI6Im1vY2stbm9kZS1pZC0wMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJhZGRycyI6W3siUmVsYXkiOiJodHRwczovL21vY2sucmVsYXkuaXJvaC5saW5rLyJ9LHsiSXAiOiIxOTIuMTY4LjEuMjA6NTAwMDAifV19'

    const DIAGNOSE = {
      hardware: {
        gpu_name: 'Apple M5 Max',
        gpu_count: 1,
        is_soc: true,
        vram_bytes: 115448725504,
        vram_gb: 115.4,
        vram_display: '128 GB',
        hostname: 'test-mac.local',
      },
      recommended: {
        name: 'Qwen3-Coder-Next-Q4_K_M',
        reason: 'Best fit for 128 GB of AI memory',
      },
      catalog: [
        {
          name: 'Qwen3-Coder-Next-Q4_K_M',
          file: 'q.gguf',
          size: '48GB',
          size_gb: 48,
          description: 'Frontier coding model',
          fit: 'comfortable',
          installed: false,
          recommended: true,
          draft: false,
        },
        {
          name: 'GLM-4.7-Flash-Q4_K_M',
          file: 'g.gguf',
          size: '18GB',
          size_gb: 18,
          description: 'Fast, capable all-rounder for everyday use.',
          fit: 'comfortable',
          installed: false,
          recommended: false,
          draft: false,
        },
        {
          name: 'Qwen3-0.6B-Q4_K_M',
          file: 't.gguf',
          size: '397MB',
          size_gb: 0.397,
          description: 'Small and quick.',
          fit: 'comfortable',
          installed: true,
          recommended: false,
          draft: false,
        },
        {
          name: 'MiniMax-M2.5-Q4_K_M',
          file: 'm.gguf',
          size: '138GB',
          size_gb: 138,
          description: 'Flagship.',
          fit: 'too_large',
          installed: false,
          recommended: false,
          draft: false,
        },
      ],
    }

    const MODEL_ID = 'unsloth/Qwen3-0.6B-GGUF:Q4_K_M'
    const STATUS = {
      node_id: 'mock-node',
      node_state: 'serving',
      llama_ready: true,
      hostname: 'test-mac.local',
      peers: [],
      models: [MODEL_ID],
      serving_models: ['unsloth/Qwen3-0.6B-GGUF@main:Q4_K_M'],
      my_vram_gb: 115.4,
      token: TOKEN,
      publication_state: 'private',
    }

    type Json = Record<string, unknown>
    const RUNNING_PHASE: Json = {
      phase: 'running',
      mode: 'host',
      visibility: 'private',
      model: 'Qwen3-0.6B-Q4_K_M',
      serving: true,
      invite_token: TOKEN,
      api_port: 9337,
      console_port: 3131,
      mesh_name: null,
    }
    const state = {
      phase: (opts.startRunning ? RUNNING_PHASE : { phase: 'idle' }) as Json,
      hostCalls: [] as Json[],
      joinCalls: [] as Json[],
    }

    // ---- EventSource mock ----
    const instances: Array<{ url: string; es: MockES }> = []
    class MockES {
      url: string
      onmessage: ((e: { data: string }) => void) | null = null
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(url: string) {
        this.url = String(url)
        instances.push({ url: this.url, es: this })
        setTimeout(() => {
          this.onopen?.()
          if (this.url.includes('/app/events')) {
            this.emit({ type: 'phase', ...state.phase })
          }
          if (this.url.includes('/api/events')) {
            this.emit(STATUS)
          }
        }, 10)
      }
      emit(obj: unknown) {
        this.onmessage?.({ data: JSON.stringify(obj) })
      }
      close() {}
      addEventListener() {}
    }
    ;(window as unknown as Json).EventSource = MockES

    const emitApp = (obj: Json) => {
      if (obj.type === 'phase') {
        const { type: _t, ...phase } = obj
        state.phase = phase
      }
      instances.filter((i) => i.url.includes('/app/events')).forEach((i) => i.es.emit(obj))
    }
    ;(window as unknown as Json).__emitApp = emitApp
    ;(window as unknown as Json).__mockState = state

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const runLaunchSequence = async (target: Json, download: boolean) => {
      emitApp({ type: 'phase', phase: 'installing_runtime' })
      await sleep(120)
      if (download) {
        emitApp({ type: 'phase', phase: 'downloading', model: target.model ?? 'model' })
        for (const pct of [15, 46, 82]) {
          await sleep(100)
          emitApp({
            type: 'download_progress',
            kind: 'model',
            label: String(target.model ?? 'model'),
            file: null,
            downloaded_bytes: pct * 4e6,
            total_bytes: 400e6,
            done: false,
          })
        }
      }
      await sleep(120)
      emitApp({ type: 'phase', phase: 'starting', mode: target.mode, model: target.model ?? null })
      await sleep(150)
      emitApp({
        type: 'phase',
        phase: 'running',
        mode: target.mode,
        visibility: target.visibility ?? 'private',
        model: target.model ?? null,
        serving: target.serving,
        invite_token: TOKEN,
        api_port: 9337,
        console_port: 3131,
        mesh_name: null,
      })
    }

    const sseResponse = (frames: string[]) => {
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          for (const frame of frames) {
            controller.enqueue(enc.encode(frame))
            await sleep(40)
          }
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const chatFrames = () => {
      const deltas = [
        '<think>',
        'pondering the mesh',
        '</think>',
        'Hello',
        ' from',
        ' the',
        ' mesh',
        '.',
      ]
      const frames = deltas.map(
        (d) =>
          `event: response.output_text.delta\ndata: ${JSON.stringify({
            type: 'response.output_text.delta',
            delta: d,
          })}\n\n`,
      )
      frames.push(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: {
            model: MODEL_ID,
            served_by: 'test-mac.local',
            usage: { input_tokens: 12, output_tokens: 40 },
            timings: { ttft_ms: 80, decode_time_ms: 1000, total_time_ms: 1100 },
          },
        })}\n\n`,
        'data: [DONE]\n\n',
      )
      return frames
    }

    const json = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    const realFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = new URL(url, location.origin).pathname

      if (path === '/app/state') return json(state.phase)
      if (path === '/app/diagnose') return json(DIAGNOSE)
      if (path === '/app/host') {
        const body = JSON.parse(String(init?.body ?? '{}'))
        state.hostCalls.push(body)
        void runLaunchSequence(
          { mode: 'host', model: body.model, visibility: body.visibility, serving: true },
          true,
        )
        return json({ ok: true }, 202)
      }
      if (path === '/app/join') {
        const body = JSON.parse(String(init?.body ?? '{}'))
        state.joinCalls.push(body)
        void runLaunchSequence(
          { mode: 'join', model: body.model, visibility: 'private', serving: Boolean(body.share) },
          Boolean(body.share),
        )
        return json({ ok: true }, 202)
      }
      if (path === '/app/invite') return json({ token: TOKEN, approx_bytes: TOKEN.length })
      if (path === '/app/shutdown' || path === '/app/reset') {
        state.phase = { phase: 'idle' }
        return json({ ok: true })
      }
      if (path === '/api/status') return json(STATUS)
      if (path === '/api/models') return json({ mesh_models: [] })
      if (path === '/v1/models')
        return json({ data: [{ id: MODEL_ID, display_name: 'Qwen3-0.6B-Q4_K_M' }] })
      if (path === '/api/responses') return sseResponse(chatFrames())

      return realFetch(input as RequestInfo, init)
    }
  }, options)
}
