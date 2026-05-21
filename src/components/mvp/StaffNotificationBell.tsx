"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  dismissNotification,
  filterActiveNotifications,
  loadDismissedNotificationIds,
  restoreNotification,
} from "@/lib/staffNotificationDismissals";
import type { StaffNotification, StaffNotificationKind } from "@/lib/staffNotifications";

type StaffNotificationBellProps = {
  notifications: StaffNotification[];
  onNotificationSelect?: (notification: StaffNotification) => void;
};

const KIND_LABELS: Record<StaffNotificationKind, string> = {
  birthday: "Birthday",
  payment_failed: "Payment",
  trial_ended: "Trial ended",
};

const KIND_STYLES: Record<StaffNotificationKind, string> = {
  birthday: "bg-violet-100 text-violet-900",
  payment_failed: "bg-red-100 text-red-900",
  trial_ended: "bg-amber-100 text-amber-950",
};

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function StaffNotificationBell({
  notifications,
  onNotificationSelect,
}: StaffNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDismissedIds(loadDismissedNotificationIds());
    setHydrated(true);
  }, []);

  const activeNotifications = useMemo(
    () => filterActiveNotifications(notifications, dismissedIds),
    [notifications, dismissedIds]
  );

  const tendedNotifications = useMemo(
    () => notifications.filter((n) => dismissedIds.has(n.id)),
    [notifications, dismissedIds]
  );

  const count = activeNotifications.length;

  function setTended(id: string, tended: boolean) {
    if (tended) {
      dismissNotification(id);
      setDismissedIds((prev) => new Set(prev).add(id));
    } else {
      restoreNotification(id);
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-[#f4f2ee] transition-colors hover:bg-white/10"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        aria-label={
          !hydrated
            ? "Notifications"
            : count > 0
              ? `Notifications, ${count} need attention`
              : "Notifications, none need attention"
        }
      >
        <BellIcon className="h-5 w-5" />
        {hydrated && count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notification inbox"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
        >
          <div className="border-b border-black/[0.06] px-4 py-3">
            <p className="text-sm font-semibold text-brand-ink">Notifications</p>
            <p className="text-xs text-brand-muted">
              {count === 0
                ? tendedNotifications.length > 0
                  ? "All items marked tended"
                  : "You're all caught up"
                : `${count} item${count === 1 ? "" : "s"} need attention`}
            </p>
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-brand-muted">No alerts right now.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {activeNotifications.length > 0 ? (
                <ul>
                  {activeNotifications.map((n) => (
                    <li key={n.id} className="border-b border-black/[0.04]">
                      <div className="flex items-start gap-2 px-3 py-3">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left transition-colors hover:bg-black/[0.02] rounded-md -m-1 p-1"
                          onClick={() => {
                            onNotificationSelect?.(n);
                            setOpen(false);
                          }}
                        >
                          <div className="flex gap-2">
                            <span
                              className={[
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                KIND_STYLES[n.kind],
                              ].join(" ")}
                            >
                              {KIND_LABELS[n.kind]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-brand-ink">{n.title}</span>
                              <span className="mt-0.5 block text-xs leading-snug text-brand-muted">
                                {n.subtitle}
                              </span>
                            </span>
                          </div>
                        </button>
                        <label className="flex shrink-0 cursor-pointer flex-col items-center gap-0.5 pt-0.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-black/20 text-brand-red focus:ring-brand-red/30"
                            checked={false}
                            onChange={() => setTended(n.id, true)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Mark ${n.title} as tended`}
                          />
                          <span className="text-[9px] font-medium uppercase tracking-wide text-brand-muted">
                            Tended
                          </span>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-center text-sm text-brand-muted">Nothing left in your inbox.</p>
              )}

              {tendedNotifications.length > 0 ? (
                <div className="border-t border-black/[0.06] bg-black/[0.02]">
                  <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
                    Tended
                  </p>
                  <ul>
                    {tendedNotifications.map((n) => (
                      <li key={n.id} className="border-t border-black/[0.04]">
                        <div className="flex items-start gap-2 px-3 py-2.5 opacity-70">
                          <div className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-brand-muted line-through">
                              {n.title}
                            </span>
                          </div>
                          <label className="flex shrink-0 cursor-pointer flex-col items-center gap-0.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-black/20 text-brand-red focus:ring-brand-red/30"
                              checked
                              onChange={() => setTended(n.id, false)}
                              aria-label={`Undo tended for ${n.title}`}
                            />
                            <span className="text-[9px] font-medium uppercase tracking-wide text-brand-muted">
                              Tended
                            </span>
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
