// The Rascals logo mark — the README hero look: white glyph (two peers +
// encrypted link, true cutout cores) on a rounded tile, plus the faint
// status dot. Tile colors come from CSS vars (--mark-tile-a/b, see
// index.css): hero black tile in dark theme, accent tile in light theme —
// so a custom accent recolors the mark live and it never reads as a black
// blob on light surfaces.

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
        <mask id="rm-holes">
          <rect width="256" height="256" fill="white" />
          <circle cx="96" cy="96" r="11" fill="black" />
          <circle cx="160" cy="160" r="14" fill="black" />
        </mask>
        <linearGradient id="rm-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mark-tile-a)" />
          <stop offset="1" stopColor="var(--mark-tile-b)" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#rm-tile)" />
      <g mask="url(#rm-holes)">
        {/* encrypted link between the two peers */}
        <path d="M96 96 L160 160" stroke="#ffffff" strokeWidth="30" strokeLinecap="round" fill="none" />
        {/* peer A (you) + peer B (friend) */}
        <circle cx="96" cy="96" r="40" fill="#ffffff" />
        <circle cx="160" cy="160" r="40" fill="#ffffff" />
      </g>
      {/* live / online status */}
      <circle cx="190" cy="130" r="20" fill="#ffffff" opacity="0.18" />
      <circle cx="190" cy="130" r="12" fill="#ffffff" />
    </svg>
  )
}
