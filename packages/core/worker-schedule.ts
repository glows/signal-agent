export type WorkerSchedule = {
  frequency: "daily" | "weekly";
  time: string;
  weekday: number;
  nextRunAt: string;
  lastRunAt?: string;
  lastRunStatus?: "running" | "success" | "failed";
};

function dateParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(values.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const local = dateParts(new Date(candidate), timeZone);
    candidate +=
      target -
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
      );
  }
  const local = dateParts(new Date(candidate), timeZone);
  return local.year === year &&
    local.month === month &&
    local.day === day &&
    local.hour === hour &&
    local.minute === minute
    ? new Date(candidate).toISOString()
    : null;
}

export function nextWorkerRun(
  schedule: Pick<WorkerSchedule, "frequency" | "time" | "weekday">,
  timeZone: string,
  now = new Date(),
) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(schedule.time);
  if (
    !match ||
    schedule.weekday < 0 ||
    schedule.weekday > 6 ||
    !Number.isInteger(schedule.weekday)
  )
    return null;
  try {
    const local = dateParts(now, timeZone);
    for (let offset = 0; offset < 8; offset++) {
      const day = new Date(
        Date.UTC(local.year, local.month - 1, local.day + offset),
      );
      if (
        schedule.frequency === "weekly" &&
        day.getUTCDay() !== schedule.weekday
      )
        continue;
      const iso = zonedInstant(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        Number(match[1]),
        Number(match[2]),
        timeZone,
      );
      if (iso && Date.parse(iso) > now.getTime()) return iso;
    }
  } catch {
    return null;
  }
  return null;
}
