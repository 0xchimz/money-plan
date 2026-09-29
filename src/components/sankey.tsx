import { useLayoutEffect, useRef, useState } from 'react'
import { pct } from '@/lib/format'

export interface SankeyNode { id: string; label: string; column: number; color: string; note?: string }
export interface SankeyLink { source: string; target: string; value: number }

const NODE_W = 10
const PAD = 16      // vertical gap between nodes — also keeps one-line labels from colliding
const GAP = 6       // node → label

type Placed = SankeyNode & { x: number; y: number; h: number; value: number; inY: number; outY: number }
type Band = SankeyLink & { key: string; w: number; sy: number; ty: number; from: Placed; to: Placed }

/**
 * Flow diagram with fixed columns and a fixed node order (no relaxation): nodes stack top-down in the order given,
 * so pass them grouped the way they should read. A band is a stroke as wide as its value and takes its target's colour.
 */
export function Sankey({ nodes, links, format, height = 420, labelWidth = 170, label }: {
  nodes: SankeyNode[]
  links: SankeyLink[]
  format: (n: number) => string
  height?: number
  labelWidth?: number   // room kept right of the last column for its labels
  label: string         // accessible summary
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ node?: string; link?: string; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const narrow = width < 640
  const labelW = narrow ? Math.min(labelWidth, 120) : labelWidth
  const sum = (ls: SankeyLink[]) => ls.reduce((s, l) => s + l.value, 0)
  const live = links.filter((l) => l.value > 0)
  const valued = nodes
    .map((n) => ({ ...n, value: Math.max(sum(live.filter((l) => l.target === n.id)), sum(live.filter((l) => l.source === n.id))) }))
    .filter((n) => n.value > 0)
  const cols = Math.max(...valued.map((n) => n.column), 0) + 1
  const byCol = Array.from({ length: cols }, (_, c) => valued.filter((n) => n.column === c))
  const ky = Math.min(...byCol.filter((c) => c.length).map((c) => (height - (c.length - 1) * PAD) / c.reduce((s, n) => s + n.value, 0)))
  const colX = (c: number) => (cols === 1 ? 0 : (c * Math.max(width - NODE_W - labelW, 0)) / (cols - 1))

  const placed = new Map<string, Placed>()
  for (const col of byCol) {
    let y = 0
    for (const n of col) {
      const h = Math.max(n.value * ky, 2)
      placed.set(n.id, { ...n, x: colX(n.column), y, h, inY: y, outY: y })
      y += h + PAD
    }
  }
  // Bands leave a node in the order of their targets and enter in the order of their sources → fewest crossings
  const order = (id: string) => { const p = placed.get(id)!; return p.column * 1e6 + p.y }
  const bands: Band[] = live
    .filter((l) => placed.has(l.source) && placed.has(l.target))
    .map((l) => ({ ...l, key: `${l.source}→${l.target}`, w: l.value * ky, sy: 0, ty: 0, from: placed.get(l.source)!, to: placed.get(l.target)! }))
  for (const b of [...bands].sort((a, b) => order(a.target) - order(b.target))) { b.sy = b.from.outY; b.from.outY += b.w }
  for (const b of [...bands].sort((a, b) => order(a.source) - order(b.source))) { b.ty = b.to.inY; b.to.inY += b.w }

  const lit = (b: Band) => !hover || hover.link === b.key || hover.node === b.source || hover.node === b.target
  const move = (e: React.PointerEvent, h: { node?: string; link?: string }) => {
    const r = ref.current!.getBoundingClientRect()
    setHover({ ...h, x: e.clientX - r.left, y: e.clientY - r.top })
  }

  const tipBand = hover?.link ? bands.find((b) => b.key === hover.link) : undefined
  const tipNode = hover?.node ? placed.get(hover.node) : undefined

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          <rect width={width} height={height} fill="transparent" onPointerMove={() => setHover(null)} />
          <g fill="none">
            {bands.map((b) => {
              const x0 = b.from.x + NODE_W
              const x1 = b.to.x
              const y0 = b.sy + b.w / 2
              const y1 = b.ty + b.w / 2
              const xm = (x0 + x1) / 2
              const d = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1}`
              return (
                <g key={b.key}>
                  <path d={d} stroke={b.to.color} strokeWidth={Math.max(b.w, 1)} strokeOpacity={!hover ? 0.32 : lit(b) ? 0.6 : 0.07} className="transition-[stroke-opacity]" />
                  <path d={d} stroke="transparent" strokeWidth={Math.max(b.w, 10)} onPointerMove={(e) => move(e, { link: b.key })} />
                </g>
              )
            })}
          </g>
          {[...placed.values()].map((n) => {
            const dim = hover && hover.node !== n.id && !bands.some((b) => lit(b) && (b.source === n.id || b.target === n.id))
            return (
              <g key={n.id} opacity={dim ? 0.35 : 1} className="transition-opacity" onPointerMove={(e) => move(e, { node: n.id })}>
                <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2} fill={n.color} />
                <text x={n.x + NODE_W + GAP} y={n.y + n.h / 2} dy="0.35em" fontSize={narrow ? 11 : 12}
                  stroke="var(--card)" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke" className="select-none">
                  <tspan fill="var(--foreground)">{n.label}</tspan>
                  <tspan fill="var(--muted-foreground)" className="tabular"> {format(n.value)}</tspan>
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover && (tipBand || tipNode) && (
        <div className="pointer-events-none absolute z-10 w-max max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: Math.min(hover.x + 14, Math.max(width - 260, 0)), top: hover.y + 14 }}>
          {tipBand ? (
            <>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: tipBand.to.color }} aria-hidden />
                <span className="tabular font-medium">{format(tipBand.value)}</span>
                <span className="text-muted-foreground">{pct(tipBand.value / tipBand.from.value, 0)} ของ {tipBand.from.label}</span>
              </div>
              <div className="mt-1">{tipBand.from.label} → {tipBand.to.label}</div>
              {tipBand.to.note && <div className="mt-1 text-muted-foreground">{tipBand.to.note}</div>}
            </>
          ) : tipNode && (
            <>
              <div className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: tipNode.color }} aria-hidden />
                <span className="font-medium">{tipNode.label}</span>
                <span className="tabular">{format(tipNode.value)}</span>
              </div>
              {tipNode.note && <div className="mt-1 text-muted-foreground">{tipNode.note}</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
