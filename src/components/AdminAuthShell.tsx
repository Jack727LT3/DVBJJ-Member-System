"use client";

import DvbjjLogo from "@/components/DvbjjLogo";
import KioskSnakeBorderCard from "@/components/KioskSnakeBorderCard";

export default function AdminAuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col bg-brand-cream font-sans text-brand-ink">
      <header className="border-b border-white/10 bg-brand-ink text-[#f4f2ee]">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <DvbjjLogo variant="on-dark" size="header" className="shrink-0" />
            <div className="hidden h-8 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8a6a3]">Staff</p>
              <p className="text-sm font-medium text-[#f4f2ee]">{title}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:py-14">
        <KioskSnakeBorderCard
          className="w-full max-w-[420px] shadow-[0_24px_80px_-20px_rgba(12,12,14,0.25)]"
          innerClassName="px-8 py-9 sm:px-10 sm:py-10"
        >
          {children}
          {footer}
        </KioskSnakeBorderCard>
      </div>
    </main>
  );
}
