const faNumber = new Intl.NumberFormat("fa-IR");
const faDate = new Intl.DateTimeFormat("fa-IR", { calendar: "persian", dateStyle: "medium" });
const faDateTime = new Intl.DateTimeFormat("fa-IR", {
  calendar: "persian",
  dateStyle: "medium",
  timeStyle: "short",
});
const faTime = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const faWeekday = new Intl.DateTimeFormat("fa-IR", { weekday: "long" });

export const num = (value: number | null | undefined) => faNumber.format(value ?? 0);

export const weekdayNames = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function toEnglishDigits(value: string) {
  return String(value).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

export function weekdayOf(value?: string | null) {
  if (!value) return "";
  try {
    return faWeekday.format(new Date(value));
  } catch {
    return "";
  }
}

/** «شنبه ۱۷ آبان ۱۴۰۵» */
export function formatSessionDate(value?: string | null) {
  const weekday = weekdayOf(value);
  const date = formatDate(value);
  return weekday ? `${weekday} ${date}` : date;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return faDate.format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return faDateTime.format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  if (/^\d{2}:\d{2}/.test(value)) return toPersianDigits(value.slice(0, 5));
  try {
    return faTime.format(new Date(value));
  } catch {
    return "—";
  }
}

export function formatBytes(bytes: number) {
  if (!bytes) return "۰";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  let index = 0;
  let size = bytes;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${toPersianDigits(size.toFixed(size >= 10 || index === 0 ? 0 : 1))} ${units[index]}`;
}

export function todayWeekday() {
  // JS: Sunday=0 … Saturday=6 ; school week: Saturday=0 … Friday=6
  return (new Date().getDay() + 1) % 7;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "صبح بخیر";
  if (hour < 17) return "وقت بخیر";
  return "شب بخیر";
}
