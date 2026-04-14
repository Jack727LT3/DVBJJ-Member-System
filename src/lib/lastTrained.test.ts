import { describe, expect, it } from "vitest";
import { formatLastTrainedLine } from "./lastTrained";

describe("formatLastTrainedLine", () => {
  it("handles missing prior visit", () => {
    expect(formatLastTrainedLine(null, new Date("2026-04-13T12:00:00Z"))).toMatch(/don’t have an earlier visit/i);
  });

  it("uses calendar days for recent visits", () => {
    const now = new Date("2026-04-13T12:00:00Z");
    const prior = new Date("2026-04-10T12:00:00Z");
    expect(formatLastTrainedLine(prior.toISOString(), now)).toContain("3 days ago");
  });
});
