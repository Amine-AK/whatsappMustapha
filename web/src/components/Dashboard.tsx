"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { dueText, money, searchDigits, STATUS_LABEL } from "@/lib/format";
import type { LocalCustomer } from "@/lib/offline";
import type { DueStatus } from "@/lib/sheet-logic";
import { CustomerForm } from "./CustomerForm";
import { Modal } from "./Modal";
import { PaymentDialog } from "./PaymentDialog";
import { RemindersDialog } from "./RemindersDialog";
import { SyncBar } from "./SyncBar";
import { useOfflineCustomers } from "./useOfflineCustomers";

type Customer = LocalCustomer;

type Sort = "due" | "debt-desc" | "debt-asc" | "name";
type StatusFilter = "all" | "owing" | DueStatus;

interface Filters {
  status: StatusFilter;
  from: string;
  to: string;
  minDebt: string;
  maxDebt: string;
  sort: Sort;
}

const DEFAULT_FILTERS: Filters = { status: "owing", from: "", to: "", minDebt: "", maxDebt: "", sort: "due" };

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "owing", label: "عليهم الكريدي" },
  { value: "overdue", label: STATUS_LABEL.overdue },
  { value: "today", label: STATUS_LABEL.today },
  { value: "tomorrow", label: STATUS_LABEL.tomorrow },
  { value: "upcoming", label: STATUS_LABEL.upcoming },
  { value: "nodate", label: STATUS_LABEL.nodate },
  { value: "paid", label: STATUS_LABEL.paid },
  { value: "all", label: "الكل" },
];

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; customer: Customer }
  | { kind: "pay"; customer: Customer }
  | { kind: "delete"; customer: Customer }
  | { kind: "remind" }
  | null;

export function Dashboard() {
  const data = useOfflineCustomers();
  const { customers, today, loadError, online } = data;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    if (!customers) return [];
    const q = query.trim().toLowerCase();
    const digits = searchDigits(q);
    const min = filters.minDebt ? Number(filters.minDebt) : -Infinity;
    const max = filters.maxDebt ? Number(filters.maxDebt) : Infinity;
    const list = customers.filter((c) => {
      if (q) {
        const byName = c.name.toLowerCase().includes(q);
        const byPhone = digits.length >= 3 && (c.phoneIntl.includes(digits) || c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")));
        if (!byName && !byPhone) return false;
      }
      if (filters.status === "owing" && c.remaining <= 0) return false;
      if (filters.status !== "all" && filters.status !== "owing" && c.status !== filters.status) return false;
      if (filters.from && (!c.dueDate || c.dueDate < filters.from)) return false;
      if (filters.to && (!c.dueDate || c.dueDate > filters.to)) return false;
      if (c.remaining < min || c.remaining > max) return false;
      return true;
    });
    const byDue = (a: Customer, b: Customer) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    const sorters: Record<Sort, (a: Customer, b: Customer) => number> = {
      due: byDue,
      "debt-desc": (a, b) => b.remaining - a.remaining,
      "debt-asc": (a, b) => a.remaining - b.remaining,
      name: (a, b) => a.name.localeCompare(b.name, "ar"),
    };
    return list.sort(sorters[filters.sort]);
  }, [customers, query, filters]);

  const summary = useMemo(() => {
    const list = customers ?? [];
    const owing = list.filter((c) => c.remaining > 0);
    const overdue = owing.filter((c) => c.status === "overdue");
    return {
      totalDebt: owing.reduce((s, c) => s + c.remaining, 0),
      owing: owing.length,
      overdue: overdue.length,
      overdueDebt: overdue.reduce((s, c) => s + c.remaining, 0),
      dueSoon: owing.filter((c) => c.status === "today" || c.status === "tomorrow").length,
    };
  }, [customers]);

  const activeFilterCount =
    Number(Boolean(filters.from)) + Number(Boolean(filters.to)) + Number(Boolean(filters.minDebt)) + Number(Boolean(filters.maxDebt));

  // Saved on the device first; this says whether it already reached the sheet.
  const savedNote = online ? "" : " (فالتيليفون، غادي يتزامن ملي ترجع الأنترنيت)";

  // Reminders read the sheet: they need the internet and every change already sent.
  const reminderBlocked = !online
    ? "التذكير خاصو الأنترنيت"
    : data.pendingCount > 0 || data.syncing
      ? "تسنى حتى تتزامن التعديلات"
      : "";

  async function confirmDelete(c: Customer) {
    await data.remove(c);
    setDialog(null);
    setToast(`تمسح ${c.name}${savedNote}`);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⚡
          </span>
          <div>
            <h1>ELECTRO-LMESTOUR</h1>
            <p className="muted">كريدي الزبناء</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => void data.refresh()}
            disabled={!online || data.syncing}
            aria-label="حدّث من الـ Google Sheet"
          >
            {data.syncing ? "…" : "↻"}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!online}
            title={online ? undefined : "الخروج خاصو الأنترنيت"}
            onClick={async () => {
              if (data.pendingCount > 0 && !window.confirm("مازال كاين تعديلات ما تزامنوش. غادي يبقاو فالتيليفون ويتزامنو ملي تدخل من جديد. نخرج؟")) return;
              await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/login";
            }}
          >
            خروج
          </button>
        </div>
      </header>

      <main className="content">
        <SyncBar state={data} />

        <section className="summary" aria-label="ملخص">
          <div className="stat">
            <span className="stat-label">مجموع الكريدي</span>
            <span className="stat-value">{money(summary.totalDebt)}</span>
            <span className="stat-sub">{summary.owing} زبون</span>
          </div>
          <div className="stat alert-stat">
            <span className="stat-label">متأخرين</span>
            <span className="stat-value">{summary.overdue}</span>
            <span className="stat-sub">{money(summary.overdueDebt)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">اليوم وغداً</span>
            <span className="stat-value">{summary.dueSoon}</span>
            <span className="stat-sub">خاصهم يخلصو</span>
          </div>
        </section>

        <div className="actions-row">
          <button type="button" className="btn primary" onClick={() => setDialog({ kind: "add" })}>
            + زبون جديد
          </button>
          <button
            type="button"
            className="btn whatsapp"
            onClick={() => setDialog({ kind: "remind" })}
            disabled={Boolean(reminderBlocked)}
            aria-describedby={reminderBlocked ? "remind-why" : undefined}
          >
            تذكير المتأخرين
            {summary.overdue > 0 && <span className="badge">{summary.overdue}</span>}
          </button>
        </div>
        {reminderBlocked && (
          <p id="remind-why" className="muted small">
            {reminderBlocked}
          </p>
        )}

        <div className="search-row">
          <label className="visually-hidden" htmlFor="search">
            قلب بالاسم ولا بالتيليفون
          </label>
          <input
            id="search"
            type="search"
            className="search"
            placeholder="قلب بالاسم ولا بالتيليفون…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`btn ${showFilters ? "selected" : ""}`}
            aria-expanded={showFilters}
            aria-controls="filters"
            onClick={() => setShowFilters((s) => !s)}
          >
            فلتر{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        <div className="chips" role="group" aria-label="الحالة">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`chip ${filters.status === chip.value ? "on" : ""}`}
              aria-pressed={filters.status === chip.value}
              onClick={() => setFilters((f) => ({ ...f, status: chip.value }))}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <section id="filters" className="filters" aria-label="فلتر">
            <fieldset>
              <legend>تاريخ الأداء</legend>
              <div className="filter-pair">
                <label>
                  من
                  <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
                </label>
                <label>
                  حتى
                  <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>المتبقي (درهم)</legend>
              <div className="filter-pair">
                <label>
                  من
                  <input inputMode="decimal" dir="ltr" value={filters.minDebt} onChange={(e) => setFilters((f) => ({ ...f, minDebt: e.target.value.replace(/[^\d.]/g, "") }))} />
                </label>
                <label>
                  حتى
                  <input inputMode="decimal" dir="ltr" value={filters.maxDebt} onChange={(e) => setFilters((f) => ({ ...f, maxDebt: e.target.value.replace(/[^\d.]/g, "") }))} />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>الترتيب</legend>
              <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Sort }))} aria-label="الترتيب">
                <option value="due">تاريخ الأداء (الأقرب)</option>
                <option value="debt-desc">المتبقي (الأكبر)</option>
                <option value="debt-asc">المتبقي (الأصغر)</option>
                <option value="name">الاسم</option>
              </select>
            </fieldset>
            <button type="button" className="btn ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
              مسح الفلتر
            </button>
          </section>
        )}

        {loadError && (
          <div className="alert error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="btn" onClick={() => void data.refresh()}>
              عاود
            </button>
          </div>
        )}

        {!customers && !loadError && <p className="muted center">كنجيبو الزبناء من الـ Google Sheet…</p>}

        {customers && (
          <>
            <p className="result-count muted" aria-live="polite">
              {visible.length} من {customers.length} زبون
            </p>
            {visible.length === 0 ? (
              <p className="empty">ما لقينا حتى زبون بهاد البحث.</p>
            ) : (
              <ul className="cards">
                {visible.map((c) => (
                  <li key={c.uid} className={`card status-${c.status}${c.pending ? " is-pending" : ""}`}>
                    <div className="card-top">
                      <div className="card-who">
                        <h3>{c.name}</h3>
                        {c.phone && (
                          <a className="phone" href={`tel:${c.phone.replace(/\s/g, "")}`} dir="ltr">
                            {c.phone}
                          </a>
                        )}
                      </div>
                      <div className="card-tags">
                        <span className={`pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                        {c.pending && (
                          <span className="pill pending-pill" title="محفوظ فالتيليفون، ما وصلش للـ Google Sheet باقي">
                            ما تزامنش
                          </span>
                        )}
                      </div>
                    </div>
                    {c.itemsPlain && <p className="items">{c.itemsPlain}</p>}
                    <div className="card-money">
                      <div>
                        <span className="label">المتبقي</span>
                        <span className="remaining">{money(c.remaining)}</span>
                      </div>
                      <div className="card-due">
                        <span className="label">الدفعة المقبلة</span>
                        <span>{c.remaining > 0 ? (c.dueDate || "—") : "—"}</span>
                        {c.remaining > 0 && <span className="muted small">{dueText(c.dueDate, c.status, today)}</span>}
                      </div>
                    </div>
                    <p className="muted small">
                      الثمن {money(c.sellTotal)} · خلص {money(c.paidTotal)}
                      {c.installment ? ` · الطريطة ${c.installment}` : ""}
                    </p>
                    <div className="card-actions">
                      <button type="button" className="btn primary" onClick={() => setDialog({ kind: "pay", customer: c })} disabled={c.remaining <= 0}>
                        دفعة
                      </button>
                      <button type="button" className="btn" onClick={() => setDialog({ kind: "edit", customer: c })}>
                        تعديل
                      </button>
                      <button type="button" className="btn danger-ghost" onClick={() => setDialog({ kind: "delete", customer: c })}>
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {dialog?.kind === "add" && (
        <CustomerForm
          today={today}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await data.add(values);
            setDialog(null);
            setToast(`تزاد ${values.name}${savedNote}`);
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <CustomerForm
          customer={dialog.customer}
          today={today}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await data.edit(dialog.customer, values);
            setDialog(null);
            setToast(`تبدلات معلومات ${values.name}${savedNote}`);
          }}
        />
      )}
      {dialog?.kind === "pay" && (
        <PaymentDialog
          customer={dialog.customer}
          today={today}
          onClose={() => setDialog(null)}
          onSubmit={async (p) => {
            await data.pay(dialog.customer, p);
            setDialog(null);
            setToast(`تسجلات الدفعة ديال ${dialog.customer.name}${savedNote}`);
          }}
        />
      )}
      {dialog?.kind === "delete" && <DeleteDialog customer={dialog.customer} onClose={() => setDialog(null)} onConfirm={confirmDelete} />}
      {dialog?.kind === "remind" && (
        <RemindersDialog
          onClose={() => {
            setDialog(null);
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function DeleteDialog({ customer, onClose, onConfirm }: { customer: Customer; onClose: () => void; onConfirm: (c: Customer) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="حذف الزبون"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm(customer);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              }
            }}
          >
            {busy ? "كيتمسح…" : "إيه، احذف"}
          </button>
        </>
      }
    >
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <p className="lead">
        واش متأكد بغيتي تحذف <strong>{customer.name}</strong> من الورقة؟
      </p>
      <dl className="facts">
        <div>
          <dt>السلع</dt>
          <dd>{customer.itemsPlain || "—"}</dd>
        </div>
        <div>
          <dt>المتبقي</dt>
          <dd className={customer.remaining > 0 ? "danger-text" : ""}>{money(customer.remaining)}</dd>
        </div>
      </dl>
      {customer.remaining > 0 && <p className="alert warn">هاد الزبون مازال عليه {money(customer.remaining)}.</p>}
      <p className="muted small">
        {customer.row ? `السطر ${customer.row} غادي يتمسح نهائيا من الـ Google Sheet.` : "هاد الزبون مازال ما وصلش للـ Google Sheet، غادي يتمسح من التيليفون."}
      </p>
    </Modal>
  );
}
