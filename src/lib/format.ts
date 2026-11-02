const dayFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("cs-CZ", { hour: "numeric", minute: "2-digit" });

export function formatDay(value: string | number | Date) {
  return dayFormat.format(new Date(value));
}

export function formatTime(value: string | number | Date) {
  return timeFormat.format(new Date(value));
}

export function formatRange(start: string | Date, end: string | Date) {
  const from = new Date(start);
  const to = new Date(end);
  if (from.toDateString() === to.toDateString()) {
    return `${formatDay(from)} ${formatTime(from)}-${formatTime(to)}`;
  }
  return `${formatDay(from)} ${formatTime(from)} - ${formatDay(to)} ${formatTime(to)}`;
}
