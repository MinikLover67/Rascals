// The Rascals logo mark — two overlapping speech bubbles (you + your
// friend) on the rounded tile. Tile colors come from CSS vars
// (--mark-tile-a/b, see index.css): hero black tile in dark theme, accent
// tile in light theme — so a custom accent recolors the mark live and it
// never reads as a black blob on light surfaces.

export default function LogoMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Rascals logo"
    >
      <title>Rascals</title>
      <defs>
        <linearGradient id="rm-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mark-tile-a)" />
          <stop offset="1" stopColor="var(--mark-tile-b)" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#rm-tile)" />
      {/* friend's bubble, behind */}
      <g fill="var(--color-rascal-accent, #7c6cff)">
        <rect x="126" y="106" width="96" height="74" rx="26" />
        <path d="M180 176 L180 212 L212 176 Z" />
      </g>
      {/* your bubble, front */}
      <g fill="#ffffff">
        <rect x="34" y="50" width="126" height="94" rx="32" />
        <path d="M76 138 L76 186 L130 138 Z" />
      </g>
      {/* typing dots */}
      <circle cx="74" cy="97" r="9" fill="#101018" />
      <circle cx="100" cy="97" r="9" fill="#101018" />
      <circle cx="126" cy="97" r="9" fill="#101018" />
    </svg>
  )
}
