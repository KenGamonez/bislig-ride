import type { ReactNode } from 'react'

export type GridArtworkVariant =
  | 'hero'
  | 'ride-now'
  | 'pakyawan'
  | 'pa-deliver'
  | 'car-rentals'
  | 'driver'

type GridArtworkProps = {
  variant: GridArtworkVariant
  className?: string
}

const stroke = {
  fill: 'none' as const,
  strokeWidth: 1,
  strokeLinecap: 'round' as const
}

const art: Record<GridArtworkVariant, ReactNode> = {
  /* Right-edge cluster: route entering the top edge, tiny arc, one orange node. */
  hero: (
    <svg viewBox="0 0 130 150" preserveAspectRatio="xMaxYMin meet" role="presentation">
      <path className="lg-line-soft" {...stroke} d="M14 -8 C 62 26, 52 70, 92 100 C 110 116, 124 124, 140 128" />
      <g className="lg-flow">
        <path className="lg-dash" {...stroke} d="M40 -8 C 88 30, 78 76, 118 108" />
      </g>
      <path className="lg-arc" {...stroke} d="M80 94 A 34 34 0 0 1 114 128" />
      <circle className="lg-node-hollow" cx="92" cy="100" r="2.4" />
      <circle className="lg-node" cx="52" cy="40" r="1.5" />
      <circle className="lg-node-accent" cx="118" cy="46" r="2.2" />
      <g className="lg-tick" {...stroke}>
        <path d="M104 16 v5" />
        <path d="M22 92 v5" />
      </g>
      <g className="lg-grid" {...stroke}>
        <path d="M120 84 l0 4 4 0" />
      </g>
    </svg>
  ),
  /* Bottom gutter: dotted route, two nodes, one orange node. */
  'ride-now': (
    <svg viewBox="0 0 120 18" preserveAspectRatio="xMaxYMax meet" role="presentation">
      <g className="lg-flow">
        <path className="lg-dash" {...stroke} d="M2 15 C 26 12, 48 4, 112 6" />
      </g>
      <path className="lg-line-soft" {...stroke} d="M2 10 L 40 10" />
      <circle className="lg-node" cx="40" cy="10" r="1.5" />
      <circle className="lg-node-hollow" cx="76" cy="7" r="2.2" />
      <circle className="lg-node-accent" cx="104" cy="6" r="2.2" />
    </svg>
  ),
  /* Bottom gutter: perforation ticks + fare line. */
  pakyawan: (
    <svg viewBox="0 0 120 18" preserveAspectRatio="xMaxYMax meet" role="presentation">
      <g className="lg-static" {...stroke}>
        <path className="lg-dash" d="M4 3 v 12" />
        <path className="lg-dash" d="M14 3 v 12" />
        <path className="lg-dash" d="M24 3 v 12" />
        <path className="lg-dash" d="M34 3 v 12" />
      </g>
      <path className="lg-line-soft" {...stroke} d="M46 9 L 112 9" />
      <circle className="lg-node" cx="46" cy="9" r="1.5" />
      <circle className="lg-node-hollow" cx="112" cy="9" r="2.2" />
    </svg>
  ),
  /* Bottom gutter: directional line with a hairline chevron. */
  'pa-deliver': (
    <svg viewBox="0 0 120 18" preserveAspectRatio="xMaxYMax meet" role="presentation">
      <g className="lg-flow">
        <path className="lg-dash" {...stroke} d="M2 9 L 100 9" />
      </g>
      <path className="lg-line" {...stroke} d="M98 3 l 12 6 -12 6" />
      <circle className="lg-node" cx="42" cy="9" r="1.5" />
      <circle className="lg-node-hollow" cx="100" cy="9" r="2.2" />
    </svg>
  ),
  /* Bottom gutter: road edge + lane line. */
  'car-rentals': (
    <svg viewBox="0 0 120 18" preserveAspectRatio="xMaxYMax meet" role="presentation">
      <path className="lg-line" {...stroke} d="M2 5 L 114 5" />
      <g className="lg-flow">
        <path className="lg-dash" {...stroke} d="M4 13 L 104 13" />
      </g>
      <circle className="lg-node-hollow" cx="112" cy="5" r="2.2" />
      <circle className="lg-node" cx="48" cy="13" r="1.5" />
    </svg>
  ),
  /* Right-edge continuation for the driver section header. */
  driver: (
    <svg viewBox="0 0 150 46" preserveAspectRatio="xMaxYMin meet" role="presentation">
      <path className="lg-line-soft" {...stroke} d="M-8 32 C 28 24, 56 38, 104 28 S 152 20, 172 26" />
      <g className="lg-flow">
        <path className="lg-dash" {...stroke} d="M-8 40 C 28 32, 56 44, 104 35 S 152 27, 172 32" />
      </g>
      <circle className="lg-node-hollow" cx="106" cy="28" r="2.2" />
      <circle className="lg-node" cx="52" cy="37" r="1.5" />
    </svg>
  )
}

export function GridArtwork({ variant, className }: GridArtworkProps) {
  return (
    <span className={'lg-art' + (className ? ' ' + className : '')} aria-hidden="true">
      {art[variant]}
    </span>
  )
}