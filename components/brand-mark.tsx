/**
 * The MEDWYN identity, as components.
 *
 * Two pieces, because they have different jobs and different contrast rules:
 * the mark is a real graphic that must read at 40px in a header, and the waves
 * are ornament that must never compete with text laid over them.
 *
 * Inline SVG rather than <img>: these are tiny, they inherit the theme through
 * currentColor and the brand tokens, and they must not cost a network round
 * trip in the header of every page.
 */

/** The glyph: a double helix crossed by a pulse line. */
export function BrandMark({
  size = 48,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="mk-strand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#30DBDB" />
          <stop offset="1" stopColor="#2BB9A8" />
        </linearGradient>
        <radialGradient id="mk-bg" cx="0.2" cy="0" r="1.1">
          <stop offset="0" stopColor="#14515F" />
          <stop offset="0.6" stopColor="#072A34" />
        </radialGradient>
      </defs>

      <rect width="512" height="512" rx="116" fill="url(#mk-bg)" />

      <g
        fill="none"
        stroke="#30DBDB"
        strokeLinecap="round"
        opacity="0.22"
      >
        <path d="M40 360c70-46 126 30 196-16s126 26 196-26" strokeWidth="12" />
        <path d="M40 410c70-46 126 30 196-16s126 26 196-26" strokeWidth="8" opacity="0.7" />
      </g>

      <g stroke="url(#mk-strand)" strokeWidth="20" strokeLinecap="round" fill="none">
        <path d="M196 150c60 36 60 176 0 212" />
        <path d="M316 150c-60 36-60 176 0 212" />
        <g strokeWidth="14" opacity="0.85">
          <path d="M206 196h100" />
          <path d="M186 256h140" />
          <path d="M206 316h100" />
        </g>
      </g>

      <path
        d="M136 256h44l26-42 30 84 26-42h114"
        fill="none"
        stroke="#F4FAFB"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The flowing ribbons from the logo, as a background layer.
 *
 * Absolutely positioned to fill its container, so the parent needs
 * `position: relative` and `overflow: hidden` — `.brand-surface` provides both.
 * Everything here is held well under full opacity: white body text over this
 * still measures above 7:1, which is the whole reason the ornament is allowed
 * behind content at all.
 */
export function BrandWaves({ className = '' }: { className?: string }) {
  return (
    <svg
      // -z-10 matters: an absolutely positioned child paints above static
      // siblings, so without it the ribbons would cover the headline. The
      // parent's `isolation: isolate` keeps the negative index from escaping
      // behind the surface's own background.
      className={`pointer-events-none absolute inset-0 -z-10 h-full w-full ${className}`}
      viewBox="0 0 1200 600"
      // "none", not "slice": the hero is tall and narrow on a phone, and slice
      // scales a 2:1 artboard to cover it, cropping to a zoomed sliver where
      // the ribbons read as stray diagonals. Non-uniform stretch is harmless
      // on abstract curves and keeps the whole composition visible at any
      // aspect ratio.
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="wv-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#30DBDB" stopOpacity="0" />
          <stop offset="0.45" stopColor="#30DBDB" stopOpacity="0.85" />
          <stop offset="1" stopColor="#2BB9A8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wv-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5FD9D9" stopOpacity="0" />
          <stop offset="0.5" stopColor="#5FD9D9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#30DBDB" stopOpacity="0" />
        </linearGradient>
        {/* The luminosity in the mark comes from bloom, not from brighter ink. */}
        <filter id="wv-glow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="14" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ribbons spread across the full artboard height. Clustering them in
          one band leaves the rest of the surface flat, which is what the
          first attempt did. */}
      <g fill="none" filter="url(#wv-glow)" strokeLinecap="round">
        <path d="M-40 110C180 20 340 210 580 130s360-150 700-40" stroke="url(#wv-b)" strokeWidth="7" opacity="0.7" />
        <path d="M-40 200C170 90 350 290 590 200s350-160 690-50" stroke="url(#wv-a)" strokeWidth="12" opacity="0.9" />
        <path d="M-40 300C180 170 330 430 560 330s330-190 720-60" stroke="url(#wv-a)" strokeWidth="16" />
        <path d="M-40 380C200 270 340 490 600 400s340-150 680-40" stroke="url(#wv-b)" strokeWidth="11" opacity="0.85" />
        <path d="M-40 470C220 370 360 560 620 490s320-120 660-30" stroke="url(#wv-b)" strokeWidth="7" opacity="0.6" />
      </g>

      {/* Molecular specks from the mark's background. The connecting lines that
          were here read as scratches once they crossed body copy, so only the
          points survive. */}
      <g fill="#7FE6E6" opacity="0.55">
        <circle cx="150" cy="90" r="3" />
        <circle cx="330" cy="150" r="2" />
        <circle cx="520" cy="70" r="2.5" />
        <circle cx="760" cy="130" r="2" />
        <circle cx="960" cy="90" r="3" />
        <circle cx="1090" cy="200" r="2" />
        <circle cx="240" cy="520" r="2.5" />
        <circle cx="620" cy="560" r="2" />
        <circle cx="900" cy="520" r="2.5" />
      </g>
    </svg>
  );
}
