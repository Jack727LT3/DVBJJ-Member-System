import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissNotification,
  filterActiveNotifications,
  loadDismissedNotificationIds,
  restoreNotification,
} from "./staffNotificationDismissals";

const STORAGE_KEY = "dvbjj_staff_dismissed_notifications";

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", createSessionStorageMock());
});

afterEach(() => {
  sessionStorage.removeItem(STORAGE_KEY);
  vi.unstubAllGlobals();
});

describe("staffNotificationDismissals", () => {
  it("persists dismissed ids in sessionStorage", () => {
    dismissNotification("birthday-m3");
    dismissNotification("trial-t1");

    expect(loadDismissedNotificationIds()).toEqual(new Set(["birthday-m3", "trial-t1"]));
  });

  it("filters active notifications", () => {
    const all = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const dismissed = new Set(["a"]);
    expect(filterActiveNotifications(all, dismissed)).toEqual([{ id: "b", title: "B" }]);
  });

  it("restore removes a dismissal", () => {
    dismissNotification("payment-m1");
    restoreNotification("payment-m1");
    expect(loadDismissedNotificationIds().size).toBe(0);
  });
});
