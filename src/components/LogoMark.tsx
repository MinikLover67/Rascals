// The Rascals logo mark — flat solid glyph. One color, knocked out of a mask
// so the inner dots are true cutouts (works on any background). Always white:
// it sits on the dark rail (dark theme) or the purple rail (light theme),
// where white reads well in both.

export default function LogoMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={`text-white ${className}`}
      role="img"
      aria-label="Rascals logo"
    >
      <defs>
        <mask id="rm-glyph">
          <rect width="256" height="256" fill="black" />
          {/* encrypted link between the two peers */}
          <path d="M96 96 L160 160" stroke="white" strokeWidth="30" strokeLinecap="round" fill="none" />
          {/* peer A (you) + peer B (friend) */}
          <circle cx="96" cy="96" r="40" fill="white" />
          <circle cx="160" cy="160" r="40" fill="white" />
          {/* knockout cores */}
          <circle cx="96" cy="96" r="11" fill="black" />
          <circle cx="160" cy="160" r="14" fill="black" />
        </mask>
      </defs>
      <rect width="256" height="256" fill="currentColor" mask="url(#rm-glyph)" />
    </svg>
  )
}
