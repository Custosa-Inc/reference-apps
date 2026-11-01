import { z } from "zod";

// Dates are plain "YYYY-MM-DD" strings and times are "HH:MM", both on the clinic's wall clock.
// Instants are JavaScript Dates, stored in UTC.

const isoDate = z.iso.date();

export function isIsoDate(value: unknown): value is string {
  return isoDate.safeParse(value).success;
}

/** Midnight UTC on a date. UTC has no daylight saving, so every day is exactly 24 hours. */
const utcMidnight = (date: string) => new Date(`${date}T00:00Z`);

function partsIn(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far a time zone is ahead of UTC at a given instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Turns a wall-clock date and time in a time zone into a UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T${time}Z`);
  // Guess with the offset at the wall time, then correct once in case a DST change sits between.
  const guess = wall - offsetMs(new Date(wall), timeZone);
  return new Date(wall - offsetMs(new Date(guess), timeZone));
}

/** The wall-clock date and time of an instant in a time zone. Seconds are dropped. */
export function wallClockIn(instant: Date, timeZone: string): { date: string; time: string } {
  const p = partsIn(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Today's date on the clinic's wall clock. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return wallClockIn(now, timeZone).date;
}

export function addDays(date: string, days: number): string {
  return new Date(utcMidnight(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 is Sunday, 6 is Saturday. */
export function dayOfWeek(date: string): number {
  return utcMidnight(date).getUTCDay();
}

/** "9:30 AM" in the given time zone. */
export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    instant,
  );
}

/** "Monday, November 2, 2026". */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(utcMidnight(date));
}
