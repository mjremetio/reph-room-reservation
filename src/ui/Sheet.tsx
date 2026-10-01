'use client';

/**
 * Side sheet (bottom sheet on phones) used by the room sheet, My bookings and booking details; `wide` makes it a
 * centred wide modal (New booking). Esc or the backdrop closes it.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Sheet({
  title,
  subtitle,
  extra,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // Move focus into the sheet unless a field inside already took it (autoFocus).
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) closeButton.current?.focus();
  }, [title]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside ref={panel} className={`sheet${wide ? ' sheet--modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="sheet__head">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <div className="card__meta">{subtitle}</div>}
            {extra}
          </div>
          <button ref={closeButton} className="sheet__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </aside>
    </>
  );
}
