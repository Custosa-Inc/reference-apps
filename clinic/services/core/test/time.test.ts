import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, todayIn, wallClockIn, zonedTimeToUtc } from "@/time";

describe("time", () => {
  it("converts clinic wall-clock times to UTC on both sides of a DST change", () => {
    // Daylight saving time ends in the US on November 1, 2026.
    expect(zonedTimeToUtc("2026-10-30", "09:00", "America/Chicago").toISOString()).toBe(
      "2026-10-30T14:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-02", "09:00", "America/Chicago").toISOString()).toBe(
      "2026-11-02T15:00:00.000Z",
    );
  });

  it("finds today's date in the clinic's time zone", () => {
    const lateEvening = new Date("2026-11-03T04:30:00Z"); // 10:30 PM on November 2 in Chicago
    expect(todayIn("America/Chicago", lateEvening)).toBe("2026-11-02");
  });

  it("reads an instant as the clinic's wall-clock date and time", () => {
    const lateEvening = new Date("2026-11-03T04:30:00Z");
    expect(wallClockIn(lateEvening, "America/Chicago")).toEqual({
      date: "2026-11-02",
      time: "22:30",
    });
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-11-01")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("11/01/2026")).toBe(false);
  });
});
