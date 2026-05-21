"use client";

import type { ReactNode } from "react";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";

type CollapsibleSectionProps = {
  title: string;
  subtitle: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  /** Shown to the left of the expand/collapse control (e.g. CSV upload). */
  headerAside?: ReactNode;
  children: ReactNode;
};

export default function CollapsibleSection({
  title,
  subtitle,
  count,
  open,
  onToggle,
  headerAside,
  children,
}: CollapsibleSectionProps) {
  return (
    <KioskSnakeBorderCard wide innerClassName="p-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-brand-ink">
            {title}
            {count !== undefined ? (
              <span className="font-normal tabular-nums text-brand-muted"> ({count})</span>
            ) : null}
          </h2>
          <p className="mt-1 text-sm text-brand-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAside}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white text-lg font-light leading-none text-brand-ink shadow-sm hover:bg-neutral-50"
          >
            {open ? "−" : "+"}
          </button>
        </div>
      </div>
      {open ? children : null}
    </KioskSnakeBorderCard>
  );
}
