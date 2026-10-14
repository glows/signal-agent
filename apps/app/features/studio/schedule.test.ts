import { describe, expect, it } from "vitest";

import { formatZonedInput, parseZonedInput } from "./schedule";

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
});
