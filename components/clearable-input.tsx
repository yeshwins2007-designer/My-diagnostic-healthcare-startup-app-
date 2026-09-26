'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui';

/**
 * An input with an instant clear button.
 *
 * The × is a full 48px target rather than the 16px glyph most apps ship,
 * because the people typing here are often doing it one-handed on a phone.
 * Clearing returns focus to the field so the next keystroke lands where the
 * user expects, and fires a native input event so any parent form or
 * onChange handler sees the empty value — a clear button that updates only
 * its own state is how a search box ends up showing nothing while filtering
 * on the old query.
 */
export function ClearableInput({
  defaultValue = '',
  onValueChange,
  clearLabel = 'Clear',
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'> & {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  clearLabel?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  const clear = () => {
    const el = ref.current;
    if (!el) return;
    // Set through the native setter so React's onChange and any form listener
    // both observe the change, exactly as if the user had deleted the text.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  };

  return (
    <div className="relative">
      <Input
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onValueChange?.(e.target.value);
          rest.onChange?.(e);
        }}
        className="pr-16"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={clearLabel}
          className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-sunken)]"
        >
          <svg aria-hidden viewBox="0 0 24 24" width="22" height="22">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
