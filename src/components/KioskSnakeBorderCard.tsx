import type { ReactNode } from "react";

type KioskSnakeBorderCardProps = {
  children: ReactNode;
  /** Classes on the outer shell (shadow, max-width, etc.) */
  className?: string;
  /** Classes on the inner white panel (padding, etc.) */
  innerClassName?: string;
  /** Fade + slight rise on mount (welcome / outcome screens) */
  fadeIn?: boolean;
  /** Staff dashboard: full width of the page content (no max-w-xl cap). */
  wide?: boolean;
};

export default function KioskSnakeBorderCard({
  children,
  className = "",
  innerClassName = "",
  fadeIn = false,
  wide = false,
}: KioskSnakeBorderCardProps) {
  const outer = [
    "relative w-full rounded-2xl shadow-[0_24px_80px_-20px_rgba(12,12,14,0.14)]",
    wide ? "max-w-none" : "max-w-xl",
    fadeIn ? "kiosk-outcome-fade-in" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = ["relative z-10 m-[2px] rounded-[14px] border border-black/[0.06] bg-white", innerClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={outer}>
      <div className="kiosk-snake-border-clip pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div
          className="absolute left-1/2 top-1/2 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background: `conic-gradient(
              from 0deg,
              rgba(200, 16, 46, 0.11) 0deg,
              rgba(200, 16, 46, 0.11) 360deg
            )`,
          }}
        />
        <div
          className="kiosk-snake-spin-layer absolute left-1/2 top-1/2 h-[220%] w-[220%] animate-[kiosk-snake-spin_5.5s_linear_infinite]"
          style={{
            background: `conic-gradient(
              from 0deg,
              transparent 0deg 332deg,
              rgba(200, 16, 46, 0.12) 338deg,
              rgba(200, 16, 46, 0.28) 348deg,
              rgba(200, 16, 46, 0.12) 356deg,
              transparent 360deg
            )`,
          }}
        />
      </div>
      <div className={inner}>{children}</div>
    </div>
  );
}
