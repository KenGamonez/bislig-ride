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

const art: Record<GridArtworkVariant, ReactNode> = {
  hero: (
    <svg viewBox="0 0 300 140" preserveAspectRatio="xMaxYMid meet" role="presentation">
      <g className="lg-flow">
        <path className="lg-dash" d="M-20 92 C 60 86, 110 46, 176 48 S 268 54, 320 50" />
      </g>
      <path className="lg-dash lg-static" d="M-20 112 C 70 108, 150 96, 230 102 S 320 110, 400 106" />
      <path className="lg-line-soft" d="M-20 122 C 80 118, 170 108, 250 116" />
      <path className="lg-line-accent" d="M196 48 L 252 52" />
      <path className="lg-arc" d="M168 66 A 64 64 0 0 1 232 4" />
      <circle className="lg-node" cx="96" cy="54" r="2.2" />
      <circle className="lg-node" cx="196" cy="48" r="2.4" />
      <circle className="lg-node-hollow" cx="240" cy="116" r="3.4" />
      <circle className="lg-traveller" cx="250" cy="52" r="2.2" />
      <circle className="lg-node-accent" cx="224" cy="30" r="3" />
      <g className="lg-tick">
        <path d="M248 96 l0 7" />
        <path d="M262 40 l0 7" />
        <path d="M272 78 l0 7" />
        <path d="M60 22 l0 6" />
      </g>
      <g className="lg-grid">
        <path d="M250 16 l0 5 5 0" />
        <path d="M288 124 l0 5 5 0" />
      </g>
    </svg>
  ),
  'ride-now': (
    <svg viewBox="0 0 220 120" preserveAspectRatio="xMaxYMid meet" role="presentation">
      <g className="lg-flow">
        <path className="lg-dash" d="M-20 96 L 46 88 L 108 40 L 240 28" />
      </g>
      <path className="lg-line-soft" d="M-20 114 C 44 108, 96 98, 148 104 S 260 116, 280 114" />
      <path className="lg-line-accent" d="M108 40 L 158 22" />
      <circle className="lg-node" cx="46" cy="88" r="2.2" />
      <circle className="lg-node" cx="180" cy="102" r="2" />
      <circle className="lg-node-hollow" cx="108" cy="42" r="3.4" />
      <circle className="lg-node-accent" cx="154" cy="24" r="3" />
      <g className="lg-tick">
        <path d="M28 116 l0 6" />
        <path d="M64 116 l0 6" />
        <path d="M176 16 l0 6" />
      </g>
    </svg>
  ),
  pakyawan: (
    <svg viewBox="0 0 220 120" preserveAspectRatio="xMaxYMid meet" role="presentation">
      <g transform="rotate(-6 110 60)">
        <path
          className="lg-line-soft"
          d="M 22 34 h 68 v -9 l 12 9 h 86 a 9 9 0 0 1 9 9 v 36 a 9 9 0 0 1 -9 9 h -86 l -12 -9 h -68 a 9 9 0 0 1 -9 -9 v -36 a 9 9 0 0 1 9 -9 Z"
        />
        <path className="lg-dash lg-static" d="M 102 26 v 68" />
        <circle className="lg-node" cx="64" cy="60" r="2.4" />
        <circle className="lg-node-hollow" cx="160" cy="60" r="3.2" />
        <circle className="lg-node-accent" cx="128" cy="60" r="3" />
        <g className="lg-tick">
          <path d="M 40 66 v 5" />
          <path d="M 50 66 v 5" />
          <path d="M 60 66 v 5" />
        </g>
      </g>
      <path className="lg-line-soft" d="M-20 112 C 40 108, 120 114, 240 108" />
      <circle className="lg-node" cx="120" cy="112" r="2" />
    </svg>
  ),
  'pa-deliver': (
    <svg viewBox="0 0 220 120" preserveAspectRatio="xMaxYMid meet" role="presentation">
      <path className="lg-line" d="M-20 98 L 76 98 L 148 32 L 220 32" />
      <path className="lg-line-accent" d="M148 32 L 180 32" />
      <g className="lg-flow">
        <path className="lg-dash" d="M-20 112 L 80 112 L 152 46 L 220 46" />
      </g>
      <path className="lg-arrow" d="M206 23 l 16 9 -16 9" />
      <circle className="lg-node" cx="76" cy="98" r="2.4" />
      <circle className="lg-node-hollow" cx="148" cy="32" r="3.2" />
      <circle className="lg-node-accent" cx="190" cy="40" r="3" />
      <g className="lg-tick">
        <path d="M96 102 v 6" />
        <path d="M130 92 v 6" />
      </g>
      <g className="lg-grid">
        <path d="M196 62 l0 5 5 0" />
      </g>
    </svg>
  ),
  'car-rentals': (
    <svg viewBox="0 0 220 120" preserveAspectRatio="xMaxYMid meet" role="presentation">
      <path className="lg-road" d="M-20 46 C 80 46, 120 84, 180 84 L 240 84" />
      <path className="lg-road" d="M-20 66 C 80 66, 120 106, 180 106 L 240 106" />
      <g className="lg-flow">
        <path className="lg-dash" d="M-20 56 C 80 56, 120 95, 180 95" />
      </g>
      <circle className="lg-node-accent" cx="58" cy="62" r="3" />
      <circle className="lg-node" cx="150" cy="90" r="2.2" />
      <circle className="lg-node-hollow" cx="196" cy="84" r="3" />
      <g className="lg-tick">
        <path d="M40 72 v 6" />
        <path d="M140 112 v 6" />
      </g>
      <g className="lg-grid">
        <path d="M30 104 l0 5 5 0" />
      </g>
    </svg>
  ),
  driver: (
    <svg viewBox="0 0 300 90" preserveAspectRatio="xMaxYMid meet" role="presentation">
      <path className="lg-line-soft" d="M-20 56 C 70 48, 140 72, 240 58 S 360 44, 400 52" />
      <g className="lg-flow">
        <path className="lg-dash" d="M-20 66 C 70 58, 140 80, 240 66 S 360 52, 400 60" />
      </g>
      <path className="lg-arc" d="M196 26 A 40 40 0 0 1 236 66" />
      <circle className="lg-node" cx="120" cy="70" r="2" />
      <circle className="lg-node-hollow" cx="242" cy="60" r="3" />
      <circle className="lg-node-accent" cx="72" cy="56" r="2.4" />
      <g className="lg-tick">
        <path d="M28 44 v 6" />
        <path d="M150 46 v 6" />
        <path d="M288 44 v 6" />
      </g>
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