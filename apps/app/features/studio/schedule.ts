function parts(date: Date, timeZone: string) {
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
    Number(values.find((item) => item.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function formatZonedInput(iso: string, timeZone: string) {
  const { year, month, day, hour, minute } = parts(new Date(iso), timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseZonedInput(
  value: string,
  timeZone: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(target)) return null;
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const local = parts(new Date(candidate), timeZone);
    const displayed = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
    );
    candidate += target - displayed;
  }
  const date = new Date(candidate);
  if (
    Number.isNaN(date.getTime()) ||
    formatZonedInput(date.toISOString(), timeZone) !== value
  )
    return null;
  return date.toISOString();
}

export function formatZonedDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function upcomingQueueSlots(now: Date, timeZone: string, count = 5) {
  const localToday = formatZonedInput(now.toISOString(), timeZone).slice(0, 10);
  const [year, month, day] = localToday.split("-").map(Number);
  const slots: string[] = [];
  for (let offset = 0; slots.length < count && offset < count + 8; offset++) {
    const date = new Date(Date.UTC(year!, month! - 1, day! + offset))
      .toISOString()
      .slice(0, 10);
    const iso = parseZonedInput(`${date}T18:00`, timeZone);
    if (iso && Date.parse(iso) > now.getTime()) slots.push(iso);
  }
  return slots;
}
