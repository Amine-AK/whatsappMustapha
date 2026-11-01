"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { Sale } from "@/lib/ledger";
import { displayDate, displayDateTime } from "@/lib/receipt";
import { filterSales, percent, rangeOf, report, type Group, type RangePreset } from "@/lib/shop";
import { can, seesCost } from "@/lib/roles";
import { SaleTicketDialog } from "./SaleTicket";
import type { LedgerState } from "./useLedger";
import { Confirm } from "./ui";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "هاد السيمانة" },
  { value: "month", label: "هاد الشهر" },
  { value: "year", label: "هاد العام" },
  { value: "custom", label: "مخصص" },
];

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"];

export function ReportsView({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const cost = seesCost(data.me);
  const [preset, setPreset] = useState<RangePreset>("month");
  const [custom, setCustom] = useState({ from: data.today.slice(0, 8) + "01", to: data.today });
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [ticket, setTicket] = useState<Sale[] | null>(null);
  const [cancel, setCancel] = useState<Sale | null>(null);

  const range = rangeOf(preset, data.today, custom);
  const sales = useMemo(() => filterSales(ledger.sales, range.from, range.to, category, query), [ledger.sales, range.from, range.to, category, query]);
  const r = useMemo(() => report(sales, range.from, range.to), [sales, range.from, range.to]);
  const recent = useMemo(() => [...sales].sort((a, b) => (b.date + b.time + b.createdAt).localeCompare(a.date + a.time + a.createdAt)).slice(0, 40), [sales]);
  const cashPct = percent(r.cash, r.revenue);
  const names = useMemo(() => new Map(ledger.clients.map((c) => [c.id, c.name])), [ledger.clients]);

  return (
    <div className="view">
      <div className="chips" role="group" aria-label="المدة">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" className={`chip ${preset === p.value ? "on" : ""}`} aria-pressed={preset === p.value} onClick={() => setPreset(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="filter-pair">
          <label>
            من
            <input type="date" value={custom.from} max={data.today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </label>
          <label>
            حتى
            <input type="date" value={custom.to} max={data.today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </label>
        </div>
      )}
      <div className="search-row">
        <label className="visually-hidden" htmlFor="report-search">
          سلعة
        </label>
        <input id="report-search" type="search" className="search" placeholder="سلعة معينة: ثلاجة، iPhone، إصلاح…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="visually-hidden" htmlFor="report-category">
          الفئة
        </label>
        <select id="report-category" className="report-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">جميع الفئات</option>
          {ledger.categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">
        من {displayDate(range.from)} حتى {displayDate(range.to)}
        {query.trim() || category ? ` · ${[category, query.trim() && `«${query.trim()}»`].filter(Boolean).join(" · ")}` : ""}
      </p>

      <section className="summary kpis" aria-label="الأرقام">
        <div className="stat">
          <span className="stat-label">إجمالي المبيعات</span>
          <span className="stat-value">{money(r.revenue)}</span>
          <span className="stat-sub">
            {r.tickets} بيعة · {r.units} وحدة
          </span>
        </div>
        {cost && (
        <div className="stat profit-stat">
          <span className="stat-label">الأرباح الصافية</span>
          <span className="stat-value">{money(r.profit)}</span>
          <span className="stat-sub">{r.unknownCost > 0 ? `${r.unknownCost} بلا ثمن الشراء (ما محسوبينش)` : r.revenue > 0 ? `${percent(r.profit, r.revenue)}% من المبيعات` : "—"}</span>
        </div>
        )}
        <div className="stat">
          <span className="stat-label">كاش / كريدي</span>
          <span className="stat-value">
            {cashPct}% / {r.revenue > 0 ? 100 - cashPct : 0}%
          </span>
          <div className="split-bar" role="img" aria-label={`كاش ${cashPct}%، كريدي ${r.revenue > 0 ? 100 - cashPct : 0}%`}>
            <span className="split-cash" style={{ width: `${cashPct}%` }} />
          </div>
          <span className="stat-sub">
            {money(r.cash)} · {money(r.credit)}
          </span>
        </div>
      </section>

      {r.lines === 0 ? (
        <p className="empty">ما كاين حتى بيع فهاد المدة.</p>
      ) : (
        <>
          {r.series.length > 1 && <Chart series={r.series} monthly={r.monthly} cost={cost} />}

          <section aria-label="حسب الفئة">
            <h2 className="section-title">حسب الفئة</h2>
            <Bars groups={r.byCategory} total={r.revenue} cost={cost} />
          </section>

          <section aria-label="السلع">
            <h2 className="section-title">السلع لي تباعو (عدد الوحدات)</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>السلعة</th>
                  <th>الوحدات</th>
                  <th>المبيعات</th>
                  {cost && <th>الربح</th>}
                </tr>
              </thead>
              <tbody>
                {r.byItem.slice(0, 30).map((g) => (
                  <tr key={g.name}>
                    <td>{g.name}</td>
                    <td dir="ltr">{g.units}</td>
                    <td>{money(g.revenue)}</td>
                    {cost && <td>{money(g.profit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {r.byItem.length > 30 && <p className="muted small">و {r.byItem.length - 30} سلعة أخرى. قلب على سلعة معينة باش تشوفها.</p>}
          </section>

          <section aria-label="آخر المبيعات">
            <h2 className="section-title">آخر المبيعات</h2>
            <ul className="cash-list">
              {recent.map((s) => (
                <li key={s.id}>
                  <span className="muted small" dir="ltr">
                    {displayDateTime(s.date, s.time)}
                  </span>
                  <span className="cash-what">
                    <strong>
                      {s.quantity > 1 ? `${s.quantity}× ` : ""}
                      {s.item}
                    </strong>
                    <span className="muted small">
                      {s.type}
                      {s.clientId ? ` · ${names.get(s.clientId) ?? "زبون مأرشف"}` : ""}
                      {s.seller ? ` · ${s.seller}` : ""}
                      {cost && s.buyPrice !== null ? ` · ربح ${money(s.sellPrice - s.buyPrice)}` : ""}
                    </span>
                    <span className="row-actions">
                      {s.type === "كاش" && (
                        <button type="button" className="link-btn" onClick={() => setTicket(ledger.sales.filter((x) => x.ticket === s.ticket))}>
                          وصل
                        </button>
                      )}
{can(data.me, "cancel_sale") && (
                      <button type="button" className="link-btn danger-text" onClick={() => setCancel(s)}>
                        إلغاء
                      </button>
                      )}
                    </span>
                  </span>
                  <span className="amount">{money(s.sellPrice)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {ticket && <SaleTicketDialog lines={ticket} onClose={() => setTicket(null)} />}
      {cancel && (
        <Confirm
          title="إلغاء البيع"
          confirmLabel="إيه، ألغي"
          danger
          onClose={() => setCancel(null)}
          onConfirm={() => {
            data.run(`إلغاء بيع · ${cancel.item}`, { type: "sale.delete", id: cancel.id });
            onToast(cancel.stockId ? "تلغى البيع ورجعات السلعة للمخزون" : "تلغى البيع");
            setCancel(null);
          }}
        >
          <p className="lead">
            نلغيو «{cancel.item}» ({money(cancel.sellPrice)})؟
          </p>
          {cancel.stockId && <p className="muted small">السلعة غادي ترجع للمخزون.</p>}
          {cancel.purchaseId && <p className="muted small">وغادي تتحيد من الحساب ديال الزبون (الدفعات ديالو كيبقاو).</p>}
        </Confirm>
      )}
    </div>
  );
}

function Bars({ groups, total, cost }: { groups: Group[]; total: number; cost: boolean }) {
  return (
    <ul className="bars">
      {groups.map((g) => (
        <li key={g.name}>
          <div className="bar-head">
            <strong>{g.name}</strong>
            <span className="muted small">
              {g.units} وحدة{cost ? ` · ربح ${money(g.profit)}` : ""}
            </span>
            <span className="amount">{money(g.revenue)}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${Math.max(2, percent(g.revenue, total))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Revenue per day (or month) as bars, profit as the darker part. */
function Chart({ series, monthly, cost }: { series: { key: string; revenue: number; profit: number }[]; monthly: boolean; cost: boolean }) {
  const W = 600;
  const H = 160;
  const max = Math.max(1, ...series.map((p) => p.revenue));
  const step = W / series.length;
  const bar = Math.max(2, step * 0.7);
  const label = (key: string) => (monthly ? MONTHS[Number(key.slice(5, 7)) - 1] : key.slice(8));
  const every = Math.ceil(series.length / (monthly ? 12 : 10));
  const best = series.reduce((a, b) => (b.revenue > a.revenue ? b : a));
  return (
    <section aria-label="المبيعات حسب الوقت">
      <h2 className="section-title">{monthly ? "المبيعات حسب الشهر" : "المبيعات حسب النهار"}</h2>
      <svg className="chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`أحسن ${monthly ? "شهر" : "نهار"}: ${label(best.key)} بـ ${money(best.revenue)}`}>
        {series.map((p, i) => {
          const h = (p.revenue / max) * H;
          const ph = (Math.max(0, p.profit) / max) * H;
          // Right to left: the first day on the right.
          const x = W - (i + 1) * step + (step - bar) / 2;
          return (
            <g key={p.key}>
              <title>{`${monthly ? label(p.key) : displayDate(p.key)}: ${money(p.revenue)} (ربح ${money(p.profit)})`}</title>
              <rect className="chart-rev" x={x} y={H - h} width={bar} height={h} rx={1.5} />
              <rect className="chart-profit" x={x} y={H - ph} width={bar} height={ph} rx={1.5} />
              {i % every === 0 && (
                <text className="chart-label" x={x + bar / 2} y={H + 14} textAnchor="middle">
                  {label(p.key)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="chart-legend small">
        <span className="dot rev" /> المبيعات
        {cost && (
          <>
            {" "}
            <span className="dot profit" /> الربح
          </>
        )}
      </p>
    </section>
  );
}
