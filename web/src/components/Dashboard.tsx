"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import { backupDue } from "@/lib/backup";
import { dueText, matchesClient, money, STATUS_LABEL } from "@/lib/format";
import { unpaidItems, type ClientSummary } from "@/lib/ledger";
import { displayDate, installmentText } from "@/lib/receipt";
import type { DueStatus } from "@/lib/sheet-logic";
import { ArchiveView } from "./ArchiveView";
import { BackupDialog } from "./BackupDialog";
import { ClientDetail } from "./ClientDetail";
import { InstallButton } from "./InstallButton";
import { NewClientForm } from "./ClientForms";
import { PaymentForm } from "./MoneyForms";
import { ReceiptDialog } from "./ReceiptDialog";
import { RemindersDialog } from "./RemindersDialog";
import { SetupScreen } from "./SetupScreen";
import { SyncBar } from "./SyncBar";
import { TopMenu } from "./TopMenu";
import { useLedger } from "./useLedger";
import { Confirm } from "./ui";

type Sort = "due" | "debt-desc" | "debt-asc" | "name" | "recent";
/** Where to search: people who owe (default, fastest), paid, everyone, or the archive. */
type Scope = "owing" | DueStatus | "paid-up" | "all" | "archive";

interface Filters {
  scope: Scope;
  from: string;
  to: string;
  minDebt: string;
  maxDebt: string;
  sort: Sort;
}

const DEFAULT_FILTERS: Filters = { scope: "owing", from: "", to: "", minDebt: "", maxDebt: "", sort: "due" };

const SCOPES: { value: Scope; label: string }[] = [
  { value: "owing", label: "عليهم الكريدي" },
  { value: "overdue", label: STATUS_LABEL.overdue },
  { value: "today", label: STATUS_LABEL.today },
  { value: "tomorrow", label: STATUS_LABEL.tomorrow },
  { value: "upcoming", label: STATUS_LABEL.upcoming },
  { value: "nodate", label: STATUS_LABEL.nodate },
  { value: "paid-up", label: "خالصين" },
  { value: "all", label: "الكل" },
  { value: "archive", label: "🗄️ الأرشيف" },
];

type Dialog =
  | { kind: "add" }
  | { kind: "client"; id: string }
  | { kind: "pay"; id: string }
  | { kind: "receipt"; id: string; paymentId?: string; notice?: string }
  | { kind: "remind" }
  | { kind: "archive-all" }
  | { kind: "backup"; reminder?: boolean }
  | null;

const MAX_CARDS = 200;

export function Dashboard() {
  const data = useLedger();
  const { summaries, today, online } = data;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    const f = filters;
    const min = f.minDebt ? Number(f.minDebt) : -Infinity;
    const max = f.maxDebt ? Number(f.maxDebt) : Infinity;
    // Narrow by scope first: by default only people who owe money are searched.
    const list = summaries.filter((s) => {
      if (f.scope === "owing" && s.remaining <= 0) return false;
      if (f.scope === "paid-up" && s.remaining > 0) return false;
      if (!["owing", "paid-up", "all", "archive"].includes(f.scope) && s.status !== f.scope) return false;
      if (!matchesClient(s.client.name, s.client.phone, query)) return false;
      if (f.from && (!s.client.nextDueDate || s.client.nextDueDate < f.from)) return false;
      if (f.to && (!s.client.nextDueDate || s.client.nextDueDate > f.to)) return false;
      if (s.remaining < min || s.remaining > max) return false;
      return true;
    });
    const due = (s: ClientSummary) => (s.remaining > 0 && s.client.nextDueDate) || "9999";
    const sorters: Record<Sort, (a: ClientSummary, b: ClientSummary) => number> = {
      due: (a, b) => due(a).localeCompare(due(b)),
      "debt-desc": (a, b) => b.remaining - a.remaining,
      "debt-asc": (a, b) => a.remaining - b.remaining,
      name: (a, b) => a.client.name.localeCompare(b.client.name, "ar"),
      recent: (a, b) => b.lastActivity.localeCompare(a.lastActivity),
    };
    return list.sort(sorters[f.sort]);
  }, [summaries, query, filters]);

  // Every 24 hours, ask to send the Excel backup on WhatsApp. Checked when the
  // app opens, after each window closes, and every 10 minutes while it stays open.
  const ready = Boolean(data.ledger) && online;
  useEffect(() => {
    if (!ready || dialog) return;
    const check = () => {
      if (backupDue()) setDialog({ kind: "backup", reminder: true });
    };
    check();
    const timer = setInterval(check, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [ready, dialog]);

  const summary = useMemo(() => {
    const owing = summaries.filter((s) => s.remaining > 0);
    const overdue = owing.filter((s) => s.status === "overdue");
    return {
      totalDebt: owing.reduce((t, s) => t + s.remaining, 0),
      owing: owing.length,
      overdue: overdue.length,
      overdueDebt: overdue.reduce((t, s) => t + s.remaining, 0),
      dueSoon: owing.filter((s) => s.status === "today" || s.status === "tomorrow").length,
      archivable: summaries.filter((s) => s.archivable),
    };
  }, [summaries]);

  if (data.needsSetup) return <SetupScreen onDone={() => void data.refresh()} />;

  const savedNote = online ? "" : " · محفوظ فالتيليفون";
  const reminderBlocked = !online ? "التذكير خاصو الأنترنيت" : data.pendingCount > 0 || data.syncing ? "تسنى حتى تتزامن التعديلات" : "";
  const archiveBlocked = !online || data.pendingCount > 0 || data.syncing;
  const activeFilterCount = [filters.from, filters.to, filters.minDebt, filters.maxDebt].filter(Boolean).length;
  const find = (id: string) => summaries.find((s) => s.client.id === id);

  async function archiveAll() {
    setDialog(null);
    setArchiving(true);
    try {
      const { archived } = await apiFetch<{ archived: number }>("/api/archive", { method: "POST", body: {} });
      await data.refresh();
      setToast(`تأرشفو ${archived} زبون`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    } finally {
      setArchiving(false);
    }
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
          <InstallButton />
          <button type="button" className="btn ghost" onClick={() => void data.refresh()} disabled={!online || data.syncing} aria-label="حدّث من الـ Google Sheet">
            {data.syncing ? "…" : "↻"}
          </button>
          <TopMenu
            online={online}
            onToast={setToast}
            onSendBackup={() => setDialog({ kind: "backup" })}
            onLogout={async () => {
              if (data.pendingCount > 0 && !window.confirm("مازال كاين تعديلات ما تزامنوش. غادي يبقاو فالتيليفون ويتزامنو ملي تدخل من جديد. نخرج؟")) return;
              await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/login";
            }}
          />
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

        {/* On a phone this row sits fixed at the bottom of the screen, under the thumb. */}
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
        {summary.archivable.length > 0 && (
          <div className="archive-banner">
            <p>
              <strong>{summary.archivable.length}</strong> زبون خلصو كلشي من أكثر من 3 شهور.
            </p>
            <button type="button" className="btn small-btn" onClick={() => setDialog({ kind: "archive-all" })} disabled={archiveBlocked || archiving}>
              {archiving ? "كنأرشفو…" : "أرشفهم"}
            </button>
          </div>
        )}

        <div className="search-row">
          <label className="visually-hidden" htmlFor="search">
            قلب بالاسم ولا بالتيليفون
          </label>
          <input
            id="search"
            type="search"
            className="search"
            placeholder={filters.scope === "archive" ? "قلب فالأرشيف بالاسم ولا بالتيليفون…" : "قلب بالاسم ولا بالتيليفون…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filters.scope !== "archive" && (
            <button type="button" className={`btn ${showFilters ? "selected" : ""}`} aria-expanded={showFilters} aria-controls="filters" onClick={() => setShowFilters((x) => !x)}>
              فلتر{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          )}
        </div>

        <div className="chips" role="group" aria-label="فين تقلب">
          {SCOPES.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`chip ${filters.scope === chip.value ? "on" : ""}`}
              aria-pressed={filters.scope === chip.value}
              onClick={() => setFilters((f) => ({ ...f, scope: chip.value }))}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {showFilters && filters.scope !== "archive" && (
          <section id="filters" className="filters" aria-label="فلتر">
            <fieldset>
              <legend>تاريخ الدفعة المقبلة</legend>
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
                  <input
                    inputMode="decimal"
                    dir="ltr"
                    value={filters.minDebt}
                    onChange={(e) => setFilters((f) => ({ ...f, minDebt: e.target.value.replace(/[^\d.]/g, "") }))}
                  />
                </label>
                <label>
                  حتى
                  <input
                    inputMode="decimal"
                    dir="ltr"
                    value={filters.maxDebt}
                    onChange={(e) => setFilters((f) => ({ ...f, maxDebt: e.target.value.replace(/[^\d.]/g, "") }))}
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>الترتيب</legend>
              <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Sort }))} aria-label="الترتيب">
                <option value="due">الدفعة المقبلة (الأقرب)</option>
                <option value="debt-desc">المتبقي (الأكبر)</option>
                <option value="debt-asc">المتبقي (الأصغر)</option>
                <option value="recent">آخر حركة</option>
                <option value="name">الاسم</option>
              </select>
            </fieldset>
            <button type="button" className="btn ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS, scope: filters.scope })}>
              مسح الفلتر
            </button>
          </section>
        )}

        {filters.scope === "archive" ? (
          <ArchiveView data={data} query={query} onToast={setToast} />
        ) : (
          <>
            {data.loadError && (
              <div className="alert error" role="alert">
                <p>{data.loadError}</p>
                <button type="button" className="btn" onClick={() => void data.refresh()}>
                  عاود
                </button>
              </div>
            )}
            {!data.ledger && !data.loadError && <p className="muted center">كنجيبو الزبناء من الـ Google Sheet…</p>}
            {data.ledger && (
              <>
                <p className="result-count muted" aria-live="polite">
                  {visible.length} زبون
                </p>
                {visible.length === 0 ? (
                  <p className="empty">{query ? "ما لقينا حتى زبون بهاد البحث هنا. جرب «الكل» ولا «الأرشيف»." : "ما كاين حتى زبون هنا."}</p>
                ) : (
                  <ul className="cards">
                    {visible.slice(0, MAX_CARDS).map((s) => (
                      <ClientCard
                        key={s.client.id}
                        s={s}
                        today={today}
                        onOpen={() => setDialog({ kind: "client", id: s.client.id })}
                        onPay={() => setDialog({ kind: "pay", id: s.client.id })}
                      />
                    ))}
                  </ul>
                )}
                {visible.length > MAX_CARDS && <p className="muted center small">كيبانو غير {MAX_CARDS} الأولين. قلب بالاسم باش تلقا الباقي.</p>}
              </>
            )}
          </>
        )}
      </main>

      {dialog?.kind === "add" && (
        <NewClientForm
          data={data}
          onClose={() => setDialog(null)}
          onDone={(id, paymentId) => {
            setToast(`تزاد الزبون${savedNote}`);
            setDialog(paymentId ? { kind: "receipt", id, paymentId, notice: "تسجل الزبون والتسبيق" } : { kind: "client", id });
          }}
        />
      )}
      {dialog?.kind === "client" && <ClientDetail data={data} clientId={dialog.id} onClose={() => setDialog(null)} onToast={setToast} />}
      {dialog?.kind === "pay" && find(dialog.id) && (
        <PaymentForm
          data={data}
          summary={find(dialog.id)!}
          onClose={() => setDialog(null)}
          onDone={(paymentId) => setDialog({ kind: "receipt", id: dialog.id, paymentId, notice: `تسجلات الدفعة${savedNote}` })}
        />
      )}
      {dialog?.kind === "receipt" && find(dialog.id) && (
        <ReceiptDialog summary={find(dialog.id)!} mode="payment" paymentId={dialog.paymentId} notice={dialog.notice} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "backup" && (
        <BackupDialog reminder={dialog.reminder} pending={data.pendingCount} onClose={() => setDialog(null)} onToast={setToast} />
      )}
      {dialog?.kind === "remind" && <RemindersDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "archive-all" && (
        <Confirm title="أرشفة الخالصين" confirmLabel={`أرشف ${summary.archivable.length}`} onClose={() => setDialog(null)} onConfirm={() => void archiveAll()}>
          <p className="lead">هاد الزبناء خلصو كلشي من أكثر من 3 شهور، غادي يتنقلو للأرشيف مع المشتريات والدفعات ديالهم:</p>
          <ul className="plain-list">
            {summary.archivable.slice(0, 15).map((s) => (
              <li key={s.client.id}>
                {s.client.name} <span className="muted small">· آخر حركة {displayDate(s.lastActivity)}</span>
              </li>
            ))}
            {summary.archivable.length > 15 && <li className="muted">و {summary.archivable.length - 15} آخرين…</li>}
          </ul>
          <p className="muted small">تقدر تلقاهم فـ «🗄️ الأرشيف» وترجعهم إلا شراو من جديد.</p>
        </Confirm>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function ClientCard({ s, today, onOpen, onPay }: { s: ClientSummary; today: string; onOpen: () => void; onPay: () => void }) {
  const c = s.client;
  const unpaid = unpaidItems(s);
  return (
    <li className={`card status-${s.status}`}>
      <button type="button" className="card-open" onClick={onOpen} aria-label={`حساب ${c.name}`}>
        <div className="card-top">
          <div className="card-who">
            <h3>{c.name}</h3>
            {c.phone && (
              <span className="phone" dir="ltr">
                {c.phone}
              </span>
            )}
          </div>
          <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>
        </div>
        <p className="items">
          {s.purchases.length} {s.purchases.length === 1 ? "سلعة" : "سلع"}
          {unpaid.length > 0 && ` · باقي: ${unpaid.join("، ")}`}
        </p>
        <div className="card-money">
          <div>
            <span className="label">المتبقي</span>
            <span className="remaining">{s.remaining > 0 ? money(s.remaining) : "خالص"}</span>
          </div>
          <div className="card-due">
            <span className="label">الدفعة المقبلة</span>
            <span>{s.remaining > 0 && c.nextDueDate ? displayDate(c.nextDueDate) : "—"}</span>
            {s.remaining > 0 && <span className="muted small">{dueText(c.nextDueDate, s.status, today)}</span>}
          </div>
        </div>
        {s.remaining > 0 && installmentText(s) && <p className="muted small">الطريطة: {installmentText(s)}</p>}
      </button>
      <div className="card-actions two">
        <button type="button" className="btn primary" onClick={onPay} disabled={!s.purchases.length}>
          دفعة
        </button>
        <button type="button" className="btn" onClick={onOpen}>
          الحساب
        </button>
      </div>
    </li>
  );
}
