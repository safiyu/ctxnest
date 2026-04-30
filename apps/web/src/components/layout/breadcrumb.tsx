"use client";

export interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

/**
 * Always-visible context strip beneath the top bar.
 * Last segment is rendered in the primary color and is non-clickable.
 */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="h-8 px-4 flex items-center gap-1.5 text-[13px] border-b border-[var(--border)] bg-[var(--bg-primary)] text-[var(--accent)] select-none"
    >
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={`${i}-${seg.label}`} className="flex items-center gap-1.5">
            {i > 0 && <span className="opacity-40">›</span>}
            {isLast || !seg.onClick ? (
              <span className={isLast ? "font-bold" : ""}>{seg.label}</span>
            ) : (
              <button
                onClick={seg.onClick}
                className="hover:text-[var(--text-primary)] transition-colors"
              >
                {seg.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
