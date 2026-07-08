const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getBusinessDate(now = new Date()) {
  const tokyo = new Date(now.getTime() + TOKYO_OFFSET_MS);
  if (tokyo.getUTCHours() < 7) tokyo.setUTCDate(tokyo.getUTCDate() - 1);
  return new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate()));
}

export function formatBusinessDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatTokyoDateTime(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatTokyoTime(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function parseLocalDateTime(value: string) {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  return new Date(`${normalized}+09:00`);
}

export function roundClockOut(date: Date) {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  rounded.setSeconds(0, 0);
  if (minutes <= 14) rounded.setMinutes(0);
  else if (minutes <= 44) rounded.setMinutes(30);
  else {
    rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(0);
  }
  return rounded;
}

export function datetimeLocalValue(date = new Date()) {
  const tokyo = new Date(date.getTime() + TOKYO_OFFSET_MS);
  return tokyo.toISOString().slice(0, 16);
}
