import { addDays, formatMoroccoPhone, type DueStatus } from "./sheet-logic";

const number = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 2 });

export function money(n: number): string {
  return `${number.format(n)} درهم`;
}

export const STATUS_LABEL: Record<DueStatus, string> = {
  overdue: "متأخر",
  today: "اليوم",
  tomorrow: "غداً",
  upcoming: "قادم",
  nodate: "بلا تاريخ",
  paid: "خالص",
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function dueText(dueDate: string, status: DueStatus, today: string): string {
  if (!dueDate) return "ما كاينش تاريخ";
  if (status === "overdue") {
    const days = daysBetween(dueDate, today);
    return `فات بـ ${days} ${days === 1 ? "يوم" : days === 2 ? "يومين" : "أيام"}`;
  }
  if (status === "today") return "اليوم";
  if (dueDate === addDays(today, 1)) return "غداً";
  return `بعد ${daysBetween(today, dueDate)} أيام`;
}

/** Digits only, Moroccan numbers turned into 212… so "0661" finds "212661…". */
export function searchDigits(q: string): string {
  const d = q.replace(/\D/g, "");
  return d.startsWith("0") ? "212" + d.slice(1) : d;
}

/** Does a customer match the search box? Name (any part) or phone in any format ("0661…", "+212 661…"). */
export function matchesClient(name: string, phone: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  const digits = searchDigits(q);
  return digits.length >= 3 && formatMoroccoPhone(phone).includes(digits);
}
