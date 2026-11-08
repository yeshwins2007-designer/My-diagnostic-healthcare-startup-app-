/**
 * Glyphs for the assistant's calls, drawn to sit in a coloured rounded tile
 * the way Settings and Health draw theirs. Line icons on a 24 grid, white on
 * the tile; the tile colours are the system colours each meaning usually
 * gets (indigo for night, orange for the door, pink for care).
 */

const PATHS: Record<string, React.ReactNode> = {
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  door: (
    <>
      <path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21" />
      <path d="M4 21h16" />
      <circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  doc: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M9 13h6M9 17h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2.5" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  phone: (
    <>
      <path d="M8.5 3.5 6 4.5C4.8 5 4.2 6.3 4.6 7.6a17 17 0 0 0 11.8 11.8c1.3.4 2.6-.2 3.1-1.4l1-2.5-3.8-2.2-2 1.7a11 11 0 0 1-5.7-5.7l1.7-2Z" />
      <path d="M15 4.5a5 5 0 0 1 4.5 4.5M15 1.5a8 8 0 0 1 7.5 7.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export const ICON_TINT: Record<string, string> = {
  moon: '#5e5ce6',
  door: '#ff9f0a',
  heart: '#ff375f',
  doc: '#30b0c7',
  calendar: '#0a84ff',
  bell: '#ff453a',
  phone: '#30d158',
  check: '#30d158',
};

export function CallGlyph({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** The glyph in its tile. */
export function CallTile({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="call-tile inline-flex shrink-0 items-center justify-center text-white"
      style={{ width: size, height: size, borderRadius: size * 0.27, background: ICON_TINT[name] ?? '#8e8e93' }}
    >
      <CallGlyph name={name} size={Math.round(size * 0.55)} />
    </span>
  );
}
