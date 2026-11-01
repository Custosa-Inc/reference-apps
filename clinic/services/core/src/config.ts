export const clinic = {
  name: "Springfield Family Clinic",
  // IANA time zone the clinic works in. Schedules are shown in this zone.
  timeZone: process.env.CLINIC_TIMEZONE ?? "America/Chicago",
};
