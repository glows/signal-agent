import { describe, expect, it } from "vitest";

import {
  formatZonedInput,
  parseZonedInput,
  upcomingQueueSlots,
} from "./schedule";

describe("account timezone scheduling", () => {
  it("stores Shanghai wall time as the correct UTC instant", () => {
    expect(parseZonedInput("2026-10-15T21:00", "Asia/Shanghai")).toBe(
      "2026-10-15T13:00:00.000Z",
    );
    expect(formatZonedInput("2026-10-15T13:00:00.000Z", "Asia/Shanghai")).toBe(
      "2026-10-15T21:00",
    );
  });

  it("rejects nonexistent New York daylight saving time", () => {
    expect(parseZonedInput("2026-03-08T02:30", "America/New_York")).toBeNull();
  });

  it("offers five future local evening slots and skips a past one", () => {
    expect(
      upcomingQueueSlots(new Date("2026-10-15T12:00:00Z"), "Asia/Shanghai")[0],
    ).toBe("2026-10-16T10:00:00.000Z");
    expect(
      upcomingQueueSlots(new Date("2026-10-15T12:00:00Z"), "Asia/Shanghai"),
    ).toHaveLength(5);
  });
});
