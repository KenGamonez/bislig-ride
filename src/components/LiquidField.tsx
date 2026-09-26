import { useId } from 'react'

/*
 * LiquidField — one large ambient generative field behind the customer
 * dashboard.
 *
 * A single sheet of fine, evenly spaced parallel lines is pushed through a
 * smooth, continuous 2D force field. The lines bend, part, compress and
 * settle back around two invisible masses, so the eye reads "liquid" from
 * the deformation alone. Nothing is filled: there is no blob, no gradient
 * shape, no polygon — only hairline strokes.
 *
 * Neighbouring lines are displaced by the same continuous function, so the
 * deformation stays coherent across the whole sheet.
 *
 * Geometry is generated once at module load and shared by every instance,
 * so rendering costs nothing and there are no per-line animations.
 */

const W = 1600
const H = 1200
const LINES = 76
const SPACING = W / LINES
const BASE_X = -80
const Y0 = -340
const Y1 = 1540
const STEP = 40

/* Two invisible masses. Each contributes a displacement proportional to the
   gradient of a Gaussian potential — smooth everywhere, with no singular
   direction term, so neighbouring lines can never cross or fold. */
const FORCES = [
  { x: 1210, y: 300, sigma: 350, amp: 190, aspect: 0.5, vy: 0.42 },
  { x: 1520, y: 820, sigma: 370, amp: 140, aspect: 0.55, vy: 0.3 }
]

/* Long-wavelength flow, growing toward the right so the sheet reads as cloth
   that has been poured rather than as a rigid grid. */
function envelope(x: number): number {
  const t = Math.min(1, Math.max(0, (x - 160) / 1100))
  return t * t * (3 - 2 * t)
}

/* Continuous displacement field: x + dx, y + dy. */
function displace(x: number, y: number): [number, number] {
  let dx = 0
  let dy = 0
  for (const f of FORCES) {
    const rx = x - f.x
    const ry = (y - f.y) * f.aspect
    const fall = Math.exp(-(rx * rx + ry * ry) / (2 * f.sigma * f.sigma))
    dx += f.amp * fall * (rx / f.sigma)
    dy += f.amp * f.vy * fall * (ry / f.sigma)
  }
  dx += 70 * envelope(x) * Math.sin((y + 160) / 700)
  dy += 16 * Math.sin((x + 80) / 520)
  return [dx, dy]
}

/* Catmull-Rom through the sampled points, emitted as cubic Béziers so the
   hairlines stay smooth with no visible polyline corners. */
function smoothPath(points: [number, number][]): string {
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

function buildLine(index: number): string {
  const baseX = BASE_X + index * SPACING
  const points: [number, number][] = []
  for (let y = Y0; y <= Y1; y += STEP) {
    const [dx, dy] = displace(baseX, y)
    points.push([baseX + dx, y + dy])
  }
  return smoothPath(points)
}

const SHEET = Array.from({ length: LINES }, (_, i) => ({
  d: buildLine(i),
  fine: i % 2 === 1
}))

export function LiquidField() {
  const uid = 'lf' + useId().replace(/[^a-zA-Z0-9]/g, '')

  return (
    <span className="lf-field" aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMaxYMid slice"
        focusable="false"
        role="presentation"
      >
        <defs>
          {/* Density ramps toward the right; the left stays editorial space.
              userSpaceOnUse keeps one field-wide ramp for every line. */}
          <linearGradient
            id={`${uid}-fade`}
            gradientUnits="userSpaceOnUse"
            x1={-100}
            y1={0}
            x2={W}
            y2={0}
          >
            <stop offset="0" stopColor="#9AAFB8" stopOpacity="0.04" />
            <stop offset="0.3" stopColor="#9AAFB8" stopOpacity="0.45" />
            <stop offset="0.62" stopColor="#9AAFB8" stopOpacity="1" />
            <stop offset="1" stopColor="#9AAFB8" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Layer 2 — atmosphere: a sparse, blurred copy of the same sheet. */}
        <g
          className="lf-soft lf-drift-b"
          fill="none"
          stroke={`url(#${uid}-fade)`}
          strokeWidth="0.8"
        >
          {SHEET.filter((_, i) => i % 3 === 0).map((line, i) => (
            <path key={`soft-${i}`} d={line.d} />
          ))}
        </g>

        {/* Layer 1 — crisp structure. */}
        <g
          className="lf-lines lf-drift-a"
          fill="none"
          stroke={`url(#${uid}-fade)`}
          strokeWidth="0.65"
        >
          {SHEET.map((line, i) => (
            <path key={`line-${i}`} d={line.d} className={line.fine ? 'lf-fine' : undefined} />
          ))}
        </g>

        {/* A small signal inside the field — not a pattern. */}
        <g className="lf-signal">
          <circle cx="1078" cy="198" r="2.2" />
          <circle cx="1332" cy="598" r="1.9" />
          <path d="M 1416 688 L 1452 695" />
        </g>
      </svg>
    </span>
  )
}