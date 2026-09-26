import { useId } from 'react'

/*
 * AtmosphereField — the Living Grid art direction, V2.
 *
 * One large ambient geometric environment drawn behind the customer
 * dashboard: fine contour-like lines that bend, converge and flow, with a
 * very light blurred duplicate for atmosphere. Everything is stroke-only
 * (no filled paths), mostly neutral, with a couple of tiny orange points.
 *
 * The composition is deliberately asymmetric — density ramps toward the
 * right side so the left stays editorial whitespace, and the whole field is
 * far larger than the viewport, so only part of it is ever visible.
 */

const FIELD_W = 1600
const FIELD_H = 1200
const CONTOUR_COUNT = 24
const HUB = { x: 1150, y: 330 }
const ROUTE_COUNT = 7

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/* Shared undulation: the whole family reads as one continuous surface. */
function baseY(x: number, phase: number): number {
  return (
    430 +
    118 * Math.sin((x + phase) / 330) +
    44 * Math.sin((x - phase) / 152 + 1.1) +
    16 * Math.sin((x + phase * 1.7) / 88)
  )
}

/* One contour: roughly parallel to its neighbours, drawn together to the
   right (convergence) and given a ragged start/end so it never reads as a
   rectangular band. */
function contourY(x: number, index: number): number {
  const t = index / (CONTOUR_COUNT - 1)
  const spacing = 30 * (1 - 0.24 * t)
  const squeeze = 1 - 0.42 * clamp01((x - 640) / 900)
  return baseY(x, index * 9) + index * spacing * squeeze
}

function contourPath(index: number, x0: number, x1: number): string {
  const points: [number, number][] = []
  for (let x = x0; x <= x1; x += 64) {
    points.push([x, contourY(x, index)])
  }
  return smoothPath(points)
}

/* Transit-style routes fanning into and past a hub. */
function routePath(k: number): string {
  const angle = -2.5 + k * 0.34
  const r0 = 520 + (k % 3) * 90
  const x0 = HUB.x + Math.cos(angle) * r0
  const y0 = HUB.y + Math.sin(angle) * r0 * 0.72
  const x1 = HUB.x - Math.cos(angle) * 150
  const y1 = HUB.y - Math.sin(angle) * 150 * 0.72
  const bow = 26 * (k % 2 === 0 ? 1 : -1)
  const points: [number, number][] = []
  for (let t = 0; t <= 1.0001; t += 0.08) {
    points.push([
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t - bow * Math.sin(t * Math.PI)
    ])
  }
  return smoothPath(points)
}

/* Catmull-Rom through the sampled points, emitted as cubic Béziers so the
   contour lines stay genuinely smooth at hairline weight. */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return ''
  const r = (n: number) => n.toFixed(1)
  let d = `M ${r(points[0][0])} ${r(points[0][1])}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    d += ` C ${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)}`
    d += `, ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)}`
    d += `, ${r(p2[0])} ${r(p2[1])}`
  }
  return d
}

export function AtmosphereField() {
  const uid = 'af' + useId().replace(/[^a-zA-Z0-9]/g, '')

  const contours = Array.from({ length: CONTOUR_COUNT }, (_, i) => ({
    d: contourPath(i, 120 + (i % 5) * 46, FIELD_W - 20 - ((i * 37) % 220))
  }))

  const routes = Array.from({ length: ROUTE_COUNT }, (_, k) => ({
    d: routePath(k),
    dashed: k % 2 === 1
  }))

  /* Nodes sit exactly on a contour, so they read as map intersections. */
  const nodes: [number, number, number, boolean][] = [
    [3, 980, 2.4, false],
    [7, 1240, 2.2, false],
    [11, 860, 2, false],
    [16, 1400, 2.4, true],
    [20, 1120, 2.2, false],
    [6, 1420, 2, true]
  ]

  const ticks = [1180, 1290, 1410, 1520]

  return (
    <span className="af-field" aria-hidden="true">
      <svg
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        preserveAspectRatio="xMaxYMid slice"
        focusable="false"
        role="presentation"
      >
        <defs>
          <linearGradient id={`${uid}-fade`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0A1418" stopOpacity="0.02" />
            <stop offset="0.26" stopColor="#0A1418" stopOpacity="0.32" />
            <stop offset="0.58" stopColor="#0A1418" stopOpacity="1" />
            <stop offset="1" stopColor="#0A1418" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Layer B — soft atmosphere: the same geometry, blurred and very light */}
        <g className="af-soft af-drift-soft" stroke={`url(#${uid}-fade)`}>
          {contours
            .filter((_, i) => i % 3 === 2)
            .map((line, i) => (
              <path key={`soft-${i}`} d={line.d} />
            ))}
        </g>

        {/* Layer A — crisp structure */}
        <g className="af-contours af-drift" stroke={`url(#${uid}-fade)`}>
          {contours.map((line, i) => (
            <path key={`contour-${i}`} d={line.d} />
          ))}
        </g>

        <g className="af-routes">
          {routes.map((route, i) => (
            <path key={`route-${i}`} d={route.d} className={route.dashed ? 'af-dash' : undefined} />
          ))}
        </g>

        <g className="af-ticks af-detail">
          {ticks.map((x, i) => (
            <path key={`tick-${i}`} d={`M ${x} ${300 + i * 46} v 12`} />
          ))}
        </g>

        <g className="af-nodes af-detail">
          {nodes.map(([line, x, r, accent], i) => (
            <circle
              key={`node-${i}`}
              cx={x}
              cy={contourY(x, line)}
              r={r}
              className={accent ? 'af-node af-node-accent' : 'af-node'}
            />
          ))}
        </g>

        <g className="af-accent af-detail">
          <path d="M 1330 470 L 1392 478" />
        </g>
      </svg>
    </span>
  )
}