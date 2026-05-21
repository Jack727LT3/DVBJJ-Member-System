const STORAGE_KEY = "dvbjj_staff_dismissed_notifications";

function readIds(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function loadDismissedNotificationIds(): Set<string> {
  return new Set(readIds());
}

export function dismissNotification(id: string): void {
  const ids = readIds();
  if (!ids.includes(id)) {
    writeIds([...ids, id]);
  }
}

export function restoreNotification(id: string): void {
  writeIds(readIds().filter((x) => x !== id));
}

export function filterActiveNotifications<T extends { id: string }>(
  notifications: T[],
  dismissedIds: Set<string>
): T[] {
  return notifications.filter((n) => !dismissedIds.has(n.id));
}

export function clearDismissedNotifications(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
