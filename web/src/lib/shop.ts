// Shop side of the app: finding products, the day's cash drawer and the sales reports.
// Pure functions, used on the phone (offline too) and in tests.

import { addDays, nowParts, type CaisseClose, type Category, type Ledger, type Payment, type Sale, type StockItem } from "./ledger";

// ---------------------------------------------------------------- search

/** Lower case, no accents or Arabic vowel marks, one form of alef / ta marbuta / ya. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(s: string): string[] {
  const n = normalizeText(s);
  // "64gb" also matches "64": split letters from numbers.
  return [...new Set([...n.split(" "), ...n.split(/(?<=\d)(?=\p{L})|(?<=\p{L})(?=\d)|\s+/u)])].filter(Boolean);
}

/**
 * Products matching what was typed, best first. Every typed word must start a
 * word of the name, family or serial ("ip 11" finds "iPhone 11 64GB"); words
 * of 3 letters or more may also be found inside a word.
 */
export function searchStock(stock: StockItem[], query: string, limit = 8): StockItem[] {
  const tokens = words(query);
  if (!tokens.length) return [];
  const scored: { item: StockItem; score: number }[] = [];
  for (const item of stock) {
    const own = words(`${item.item} ${item.serial}`);
    const family = words(item.category);
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (own.some((w) => w === t)) score += 4;
      else if (own.some((w) => w.startsWith(t))) score += 3;
      else if (family.some((w) => w.startsWith(t))) score += 1;
      else if (t.length >= 3 && normalizeText(`${item.item} ${item.serial}`).includes(t)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (normalizeText(item.item).startsWith(tokens[0])) score += 2;
    if (item.quantity > 0) score += 1;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.item.quantity - a.item.quantity || a.item.item.localeCompare(b.item.item))
    .slice(0, limit)
    .map((x) => x.item);
}

/** Icon of a product family, for the big buttons of the sale screen. */
export function categoryIcon(name: string): string {
  const n = normalizeText(name);
  if (/كهرومنزل|ثلاج|غسال/.test(n)) return "🧊";
  if (/هاتف|هواتف|تيليفون|طابليط|اجهزه/.test(n)) return "📱";
  if (/اكسسوار|كابل|شارج/.test(n)) return "🔌";
  if (/ريبار|اصلاح|صيانه/.test(n)) return "🛠️";
  if (/اواني|كوزين|مطبخ/.test(n)) return "🍳";
  if (/تلفز|تيلفز|شاش/.test(n)) return "📺";
  return "📦";
}

/**
 * Who is selling. Empty until worker accounts exist; then it will be the
 * logged-in worker, saved with every sale, stock change and drawer closing.
 */
export function currentSeller(): string {
  return "";
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Below cost, or under the family's target margin. */
export function marginCheck(price: number, cost: number | null, category: Category | undefined): "loss" | "low" | "ok" | "unknown" {
  if (cost === null || cost <= 0) return "unknown";
  if (price < cost) return "loss";
  if (category && category.marginTarget > 0 && price < cost * (1 + category.marginTarget / 100)) return "low";
  return "ok";
}

// ---------------------------------------------------------------- cash drawer

/** Shop day (Casablanca) of an ISO time stamp. */
export function dayOf(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? nowParts(new Date(t)).date : "";
}

export interface CashDay {
  date: string;
  cashSales: Sale[];
  advances: Payment[];
  installments: Payment[];
  totals: { cashSales: number; advances: number; installments: number; incoming: number };
  /**
   * Recorded that day but dated up to a week earlier: money that may be missing
   * from an earlier drawer. (Older dates are records typed in from the past, like
   * the ones moved from the old sheet.)
   */
  backdated: { kind: "sale" | "payment"; id: string; label: string; amount: number; date: string }[];
  closings: CaisseClose[];
}

const sum = (list: { amount?: number; sellPrice?: number }[]) => round2(list.reduce((s, x) => s + (x.amount ?? x.sellPrice ?? 0), 0));

/**
 * Money that came into the drawer on `date`:
 * cash sales + credit advances (تسبيق) + instalments (دفعة). Expenses come off at closing.
 */
export function cashDay(ledger: Ledger, date: string): CashDay {
  const names = new Map(ledger.clients.map((c) => [c.id, c.name]));
  const cashSales = ledger.sales.filter((s) => s.type === "كاش" && s.date === date);
  const payments = ledger.payments.filter((p) => p.date === date);
  const advances = payments.filter((p) => p.kind === "تسبيق");
  const installments = payments.filter((p) => p.kind === "دفعة");
  const totals = { cashSales: sum(cashSales), advances: sum(advances), installments: sum(installments), incoming: 0 };
  totals.incoming = round2(totals.cashSales + totals.advances + totals.installments);
  const weekBefore = addDays(date, -7);
  const late = (d: string, createdAt: string) => d < date && d >= weekBefore && dayOf(createdAt) === date;
  const backdated: CashDay["backdated"] = [
    ...ledger.sales
      .filter((s) => s.type === "كاش" && late(s.date, s.createdAt))
      .map((s) => ({ kind: "sale" as const, id: s.id, label: s.item, amount: s.sellPrice, date: s.date })),
    ...ledger.payments
      .filter((p) => late(p.date, p.createdAt))
      .map((p) => ({ kind: "payment" as const, id: p.id, label: `${p.kind} · ${names.get(p.clientId) ?? ""}`, amount: p.amount, date: p.date })),
  ];
  const closings = ledger.closings.filter((k) => k.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { date, cashSales, advances, installments, totals, backdated, closings };
}

// ---------------------------------------------------------------- reports

export type RangePreset = "today" | "week" | "month" | "year" | "custom";

/** First and last day of a preset range (weeks start on Monday). */
export function rangeOf(preset: RangePreset, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const [y, m] = today.split("-");
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      return { from: addDays(today, -weekday), to: today };
    }
    case "month":
      return { from: `${y}-${m}-01`, to: today };
    case "year":
      return { from: `${y}-01-01`, to: today };
    case "custom":
      return custom && custom.from && custom.to ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }) : { from: today, to: today };
  }
}

export interface Group {
  name: string;
  units: number;
  lines: number;
  revenue: number;
  /** Only lines whose cost is known. */
  profit: number;
}

export interface Report {
  lines: number;
  tickets: number;
  units: number;
  revenue: number;
  profit: number;
  /** Lines sold without a known cost: left out of the profit. */
  unknownCost: number;
  cash: number;
  credit: number;
  byCategory: Group[];
  byItem: Group[];
  /** Revenue per day, or per month for long ranges. */
  series: { key: string; revenue: number; profit: number }[];
  monthly: boolean;
}

function add(map: Map<string, Group>, name: string, s: Sale) {
  const g = map.get(name) ?? { name, units: 0, lines: 0, revenue: 0, profit: 0 };
  g.units += s.quantity;
  g.lines += 1;
  g.revenue = round2(g.revenue + s.sellPrice);
  if (s.buyPrice !== null) g.profit = round2(g.profit + s.sellPrice - s.buyPrice);
  map.set(name, g);
}

/** Sales between two dates (included), optionally of one family and/or matching a product name. */
export function filterSales(sales: Sale[], from: string, to: string, category = "", query = ""): Sale[] {
  const tokens = words(query);
  return sales.filter((s) => {
    if (s.date < from || s.date > to) return false;
    if (category && s.category !== category) return false;
    if (tokens.length) {
      const w = words(`${s.item} ${s.category}`);
      if (!tokens.every((t) => w.some((x) => x.startsWith(t)))) return false;
    }
    return true;
  });
}

export function report(sales: Sale[], from: string, to: string): Report {
  const byCategory = new Map<string, Group>();
  const byItem = new Map<string, Group>();
  const series = new Map<string, { key: string; revenue: number; profit: number }>();
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const monthly = days > 62;
  // Every day (or month) of the range, so empty ones show as gaps in the chart.
  if (days <= 400) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const key = monthly ? d.slice(0, 7) : d;
      if (!series.has(key)) series.set(key, { key, revenue: 0, profit: 0 });
    }
  }
  let revenue = 0;
  let profit = 0;
  let units = 0;
  let unknownCost = 0;
  let cash = 0;
  let credit = 0;
  for (const s of sales) {
    revenue += s.sellPrice;
    units += s.quantity;
    if (s.buyPrice === null) unknownCost += 1;
    else profit += s.sellPrice - s.buyPrice;
    if (s.type === "كاش") cash += s.sellPrice;
    else credit += s.sellPrice;
    add(byCategory, s.category || "بلا فئة", s);
    add(byItem, s.item.trim(), s);
    const key = monthly ? s.date.slice(0, 7) : s.date;
    const point = series.get(key) ?? { key, revenue: 0, profit: 0 };
    point.revenue = round2(point.revenue + s.sellPrice);
    if (s.buyPrice !== null) point.profit = round2(point.profit + s.sellPrice - s.buyPrice);
    series.set(key, point);
  }
  const sorted = (m: Map<string, Group>) => [...m.values()].sort((a, b) => b.revenue - a.revenue);
  return {
    lines: sales.length,
    tickets: new Set(sales.map((s) => s.ticket)).size,
    units,
    revenue: round2(revenue),
    profit: round2(profit),
    unknownCost,
    cash: round2(cash),
    credit: round2(credit),
    byCategory: sorted(byCategory),
    byItem: sorted(byItem),
    series: [...series.values()].sort((a, b) => a.key.localeCompare(b.key)),
    monthly,
  };
}

/** "45%" of a total, 0 when the total is 0. */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
