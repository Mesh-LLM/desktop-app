import { useEffect, useRef } from 'react'

interface MeshVizProps {
  /** ambient = dim fullscreen backdrop; mini = sidebar live view */
  variant: 'ambient' | 'mini'
  /** Number of peer dots besides "me" (mini variant). */
  peers?: number
  /** Pulse a packet from me to a peer while a reply streams. */
  streaming?: boolean
  className?: string
}

interface Dot {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  me?: boolean
}

const ACCENT = '#4cc2e8'
const GOOD = '#3fd08a'
const LINE = 'rgba(76, 194, 232, 0.14)'

export default function MeshViz({
  variant,
  peers = 0,
  streaming = false,
  className,
}: MeshVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamingRef = useRef(streaming)

  useEffect(() => {
    streamingRef.current = streaming
  }, [streaming])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let disposed = false

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      const { clientWidth, clientHeight } = canvas
      canvas.width = clientWidth * dpr
      canvas.height = clientHeight * dpr
    }
    resize()

    const count = variant === 'ambient' ? 14 : Math.min(1 + peers, 8)
    const dots: Dot[] = Array.from({ length: count }, (_, i) => ({
      // Deterministic-ish spread with a little randomness for organic feel.
      x: 0.15 + 0.7 * ((i * 0.618) % 1) + Math.random() * 0.05,
      y: 0.2 + 0.6 * ((i * 0.382) % 1) + Math.random() * 0.05,
      vx: (Math.random() - 0.5) * 0.0006,
      vy: (Math.random() - 0.5) * 0.0006,
      r: variant === 'ambient' ? 2.5 : 3.5,
      me: variant === 'mini' && i === 0,
    }))
    if (variant === 'mini' && dots[0]) {
      dots[0].x = 0.5
      dots[0].y = 0.5
      dots[0].r = 4.5
    }

    let packetT = 0

    const draw = () => {
      if (disposed) return
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      if (!reduced) {
        for (const d of dots) {
          if (d.me) continue
          d.x += d.vx
          d.y += d.vy
          if (d.x < 0.05 || d.x > 0.95) d.vx *= -1
          if (d.y < 0.08 || d.y > 0.92) d.vy *= -1
        }
      }

      // connections
      ctx.lineWidth = 1
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i]
          const b = dots[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < 0.42) {
            ctx.strokeStyle = LINE
            ctx.beginPath()
            ctx.moveTo(a.x * w, a.y * h)
            ctx.lineTo(b.x * w, b.y * h)
            ctx.stroke()
          }
        }
      }

      // streaming packet: travels me -> first peer
      if (streamingRef.current && dots.length > 1 && !reduced) {
        packetT = (packetT + 0.02) % 1
        const a = dots[0]
        const b = dots[1]
        const px = a.x + (b.x - a.x) * packetT
        const py = a.y + (b.y - a.y) * packetT
        ctx.fillStyle = ACCENT
        ctx.beginPath()
        ctx.arc(px * w, py * h, 2.5 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }

      // dots
      for (const d of dots) {
        ctx.fillStyle = d.me ? ACCENT : variant === 'mini' ? GOOD : 'rgba(154,161,173,0.5)'
        ctx.beginPath()
        ctx.arc(d.x * w, d.y * h, d.r * dpr, 0, Math.PI * 2)
        ctx.fill()
        if (d.me) {
          ctx.strokeStyle = 'rgba(76,194,232,0.35)'
          ctx.beginPath()
          ctx.arc(d.x * w, d.y * h, d.r * dpr * 2.2, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw)
    }

    draw()
    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [variant, peers])

  return <canvas ref={canvasRef} className={className} data-testid={`mesh-viz-${variant}`} />
}
