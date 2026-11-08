'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cx } from '@/components/ui';

const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadedPdf {
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The signed report, as the lab's own PDF. Drop it on the zone or tap to
 * choose. It goes to a route handler (a PDF is larger than a server action
 * accepts), which checks the bytes really are a PDF and stores it encrypted.
 * Replacing is allowed until the report is released to the family.
 */
export function PdfUpload({
  bookingId,
  reference,
  existing,
  enabled,
  disabledReason,
}: {
  bookingId: string;
  reference: string;
  existing: UploadedPdf | null;
  enabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<UploadedPdf | null>(existing);
  const url = `/api/lab/orders/${bookingId}/report-pdf`;
  const inputId = `pdf-${bookingId}`;

  async function send(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return setError('Choose a PDF file.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 10 MB.');
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch(url, { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as Partial<UploadedPdf> & { error?: string };
      if (!res.ok) return setError(json.error ?? 'The upload did not go through. Please try again.');
      setCurrent({ fileName: json.fileName!, sizeBytes: json.sizeBytes!, uploadedAt: json.uploadedAt! });
      router.refresh();
    } catch {
      setError('No connection. Please try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          if (!enabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (enabled) void send(e.dataTransfer.files[0]);
        }}
        className={cx(
          'relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-dashed px-4 py-4 text-center',
          // The file input covers the zone, so it is a full-size target and
          // keyboard-focusable; this draws its focus ring on the zone.
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-ink)]',
          enabled ? 'cursor-pointer hover:border-[var(--color-ink-faint)]' : 'cursor-not-allowed opacity-60',
          over ? 'border-[var(--color-ink)] bg-[var(--color-primary-wash)]' : 'border-[var(--color-line-strong)] bg-[var(--color-surface-sunken)]',
        )}
      >
        <span className="text-small font-semibold text-[var(--color-ink)]">Upload Patient Diagnostic Report (PDF)</span>
        <span className="text-[0.8125rem] text-[var(--color-ink-faint)]">
          {busy
            ? 'Uploading and encrypting…'
            : enabled
              ? current
                ? 'Drop a new file to replace it · up to 10 MB'
                : 'Drop the signed PDF here, or tap to choose · up to 10 MB'
              : disabledReason}
        </span>
        <input
          id={inputId}
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          disabled={!enabled || busy}
          onChange={(e) => void send(e.target.files?.[0])}
          className="absolute inset-0 h-full w-full cursor-[inherit] opacity-0"
          aria-label={`Upload Patient Diagnostic Report (PDF) for ${reference}`}
        />
      </label>
      {current && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-[var(--color-ink-soft)]">
          <span className="text-[var(--color-green)]">Attached</span>
          <a href={url} target="_blank" rel="noopener" className="font-medium underline">
            {current.fileName}
          </a>
          <span className="reading text-[var(--color-ink-faint)]">{size(current.sizeBytes)}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-[0.8125rem] font-medium text-[var(--color-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
