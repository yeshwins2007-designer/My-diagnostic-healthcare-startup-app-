'use client';

import { useState } from 'react';
import { cx } from '@/components/ui';

/**
 * The lab's own logo (Brandfetch, by its website domain), or its monogram.
 * The monogram is also what shows if the image fails, so a missing logo
 * never leaves a broken-image icon on a lab's own terminal.
 */
export function LabLogo({
  src,
  initials,
  name,
  size = 40,
  className,
}: {
  src: string | null;
  initials: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };

  if (src && !failed) {
    return (
      // A third-party logo at a fixed small size: next/image would proxy it
      // through our server, which Brandfetch's hotlinking terms do not allow.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${name} logo`}
        width={size}
        height={size}
        style={box}
        referrerPolicy="strict-origin-when-cross-origin"
        onError={() => setFailed(true)}
        className={cx('shrink-0 rounded-[10px] border border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)] object-contain', className)}
      />
    );
  }
  return (
    <span
      aria-label={`${name} monogram`}
      role="img"
      style={box}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-[10px] border border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)] font-mono text-[0.8125rem] font-medium tracking-[0.08em] text-[var(--color-ink)]',
        className,
      )}
    >
      {initials}
    </span>
  );
}
