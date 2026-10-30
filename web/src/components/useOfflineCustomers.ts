"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client";
import { idbGet, idbSet } from "@/lib/idb";
import {
  applyOps,
  keyCustomers,
  newId,
  shiftRowsAfterDelete,
  type LocalCustomer,
  type Op,
  type Snapshot,
} from "@/lib/offline";
import { makeStamp, stampInput, todayISO, type Customer, type CustomerInput } from "@/lib/sheet-logic";

const SNAPSHOT_KEY = "snapshot";
const OPS_KEY = "ops";
const RETRY_EVERY_MS = 30_000;

export interface PaymentInput {
  amount: number;
  paidDate: string;
  nextDueDate: string;
}

export interface OfflineState {
  customers: LocalCustomer[] | null;
  today: string;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failed: Op[];
  lastSync: string | null;
  /** Error shown when the list can't be loaded at all (no saved copy, no network). */
  loadError: string;
  /** Last sync problem (server down, login expired…). */
  syncError: string;
  refresh: () => Promise<void>;
  add: (input: CustomerInput) => Promise<LocalCustomer>;
  edit: (c: LocalCustomer, input: CustomerInput) => Promise<void>;
  /** Returns the payment's time stamp (also printed on the receipt). */
  pay: (c: LocalCustomer, p: PaymentInput) => Promise<string>;
  remove: (c: LocalCustomer) => Promise<void>;
  retry: (opId: string) => void;
  discard: (opId: string) => void;
}

/** Network problem or server temporarily down: keep the change and try later. */
function isTemporary(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 401 || e.status === 429 || e.status >= 500);
}

export function useOfflineCustomers(): OfflineState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [today, setToday] = useState(() => todayISO());

  // The sync loop works on refs so it always sees the latest data.
  const snapRef = useRef<Snapshot | null>(null);
  const opsRef = useRef<Op[]>([]);
  const running = useRef(false);

  const saveSnapshot = useCallback((s: Snapshot) => {
    snapRef.current = s;
    setSnapshot(s);
    void idbSet(SNAPSHOT_KEY, s);
  }, []);

  const saveOps = useCallback((next: Op[]) => {
    opsRef.current = next;
    setOps(next);
    void idbSet(OPS_KEY, next);
  }, []);

  const updateOp = useCallback(
    (id: string, patch: Partial<Op>) => saveOps(opsRef.current.map((o) => (o.id === id ? ({ ...o, ...patch } as Op) : o))),
    [saveOps],
  );

  /** Read the whole list from the sheet. Only when nothing is waiting to be sent. */
  const pull = useCallback(async () => {
    const data = await apiFetch<{ customers: Customer[]; today: string }>("/api/customers");
    saveSnapshot({ customers: keyCustomers(data.customers, snapRef.current?.customers ?? []), fetchedAt: new Date().toISOString() });
    setToday(data.today);
    setLoadError("");
  }, [saveSnapshot]);

  /** Send waiting changes one by one, in the order they were made. */
  const sync = useCallback(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    setSyncing(true);
    setSyncError("");
    try {
      for (;;) {
        const op = opsRef.current.find((o) => o.status === "pending");
        if (!op) break;
        const snap = snapRef.current ?? { customers: [], fetchedAt: new Date().toISOString() };
        const known = snap.customers.find((c) => c.uid === op.uid);
        const target = known ? { row: known.row, expected: known.expected } : op.target;
        if (op.kind !== "add" && !target) {
          updateOp(op.id, { status: "failed", error: "الزبون ما بقاش فالورقة" });
          continue;
        }
        updateOp(op.id, { attempts: op.attempts + 1 });
        try {
          if (op.kind === "delete") {
            const res = await apiFetch<{ row: number }>(`/api/customers/${target!.row}`, {
              method: "DELETE",
              body: { expected: target!.expected },
            });
            const rest = snap.customers.filter((c) => c.uid !== op.uid);
            saveSnapshot({ ...snap, customers: shiftRowsAfterDelete(rest, res.row) });
          } else {
            const res =
              op.kind === "add"
                ? await apiFetch<{ customer: Customer }>("/api/customers", { method: "POST", body: { ...op.input, stamp: op.stamp } })
                : op.kind === "edit"
                  ? await apiFetch<{ customer: Customer }>(`/api/customers/${target!.row}`, {
                      method: "PUT",
                      body: { input: op.input, expected: target!.expected, stamp: op.stamp },
                    })
                  : await apiFetch<{ customer: Customer }>(`/api/customers/${target!.row}/payments`, {
                      method: "POST",
                      body: { amount: op.amount, paidDate: op.paidDate, nextDueDate: op.nextDueDate, stamp: op.stamp, expected: target!.expected },
                    });
            const saved: LocalCustomer = { ...res.customer, uid: op.uid };
            const exists = snap.customers.some((c) => c.uid === op.uid);
            saveSnapshot({
              ...snap,
              customers: exists ? snap.customers.map((c) => (c.uid === op.uid ? saved : c)) : [...snap.customers, saved],
            });
          }
          saveOps(opsRef.current.filter((o) => o.id !== op.id));
        } catch (e) {
          if (isTemporary(e)) {
            setSyncError(e instanceof Error ? e.message : String(e));
            break; // try again later, keep the order
          }
          const conflict = e instanceof ApiError && e.status === 409;
          if (conflict && op.kind === "delete" && op.attempts > 0) {
            // Sent before without an answer: it was deleted then.
            const rest = snap.customers.filter((c) => c.uid !== op.uid);
            saveSnapshot({ ...snap, customers: rest });
            saveOps(opsRef.current.filter((o) => o.id !== op.id));
            continue;
          }
          // Refused for good (changed by someone else, invalid…): stop this customer's later changes too.
          const message = e instanceof Error ? e.message : String(e);
          saveOps(
            opsRef.current.map((o) =>
              o.id === op.id
                ? ({ ...o, status: "failed", error: message, target } as Op)
                : o.uid === op.uid && o.status === "pending"
                  ? ({ ...o, status: "failed", error: "ما تزامنش حيت التعديل اللي قبلو ما دازش", target } as Op)
                  : o,
            ),
          );
        }
      }
      if (!opsRef.current.some((o) => o.status === "pending")) await pull();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [pull, saveOps, saveSnapshot, updateOp]);

  // Start: show the saved copy at once, then sync if online.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [snap, savedOps] = await Promise.all([idbGet<Snapshot>(SNAPSHOT_KEY), idbGet<Op[]>(OPS_KEY)]);
      if (cancelled) return;
      if (snap) {
        snapRef.current = snap;
        setSnapshot(snap);
      }
      opsRef.current = savedOps ?? [];
      setOps(opsRef.current);
      setOnline(navigator.onLine);
      setLoaded(true);
      if (navigator.onLine) {
        await sync();
        if (!snapRef.current) setLoadError("ما قدرناش نجيبو الزبناء. تأكد من الأنترنيت وعاود.");
      } else if (!snap) {
        setLoadError("ما كاينش الأنترنيت، وهادي أول مرة كتحل فيها التطبيق فهاد الجهاز. حلو مرة وحدة بالأنترنيت.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  // Sync when the connection comes back, when the app comes to the front, and every 30 s while changes wait.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setToday(todayISO());
        if (navigator.onLine) void sync();
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (navigator.onLine && opsRef.current.some((o) => o.status === "pending")) void sync();
    }, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [sync]);

  const enqueue = useCallback(
    (op: Op) => {
      saveOps([...opsRef.current, op]);
      void sync();
    },
    [saveOps, sync],
  );

  const customers = useMemo(
    () => (loaded && snapshot ? applyOps(snapshot.customers, ops, today) : loaded && !snapshot && ops.length ? applyOps([], ops, today) : null),
    [loaded, snapshot, ops, today],
  );

  const base = { id: "", uid: "", label: "", createdAt: "", status: "pending" as const, attempts: 0 };

  return {
    customers,
    today,
    online,
    syncing,
    pendingCount: ops.filter((o) => o.status === "pending").length,
    failed: ops.filter((o) => o.status === "failed"),
    lastSync: snapshot?.fetchedAt ?? null,
    loadError: customers ? "" : loadError,
    syncError,
    refresh: async () => {
      if (!navigator.onLine) return;
      await sync();
      if (!running.current && !opsRef.current.some((o) => o.status === "pending")) {
        try {
          await pull();
        } catch (e) {
          setSyncError(e instanceof Error ? e.message : String(e));
        }
      }
    },
    add: async (input) => {
      const stamp = makeStamp();
      const op: Op = { ...base, id: newId(), uid: newId(), label: input.name, createdAt: new Date().toISOString(), kind: "add", input: stampInput(input, stamp), stamp };
      enqueue(op);
      return applyOps([], [op], today)[0];
    },
    edit: async (c, input) => {
      const stamp = makeStamp();
      enqueue({ ...base, id: newId(), uid: c.uid, label: input.name, createdAt: new Date().toISOString(), kind: "edit", input: stampInput(input, stamp), stamp });
    },
    pay: async (c, p) => {
      const stamp = makeStamp(p.paidDate);
      enqueue({ ...base, id: newId(), uid: c.uid, label: c.name, createdAt: new Date().toISOString(), kind: "pay", ...p, stamp });
      return stamp;
    },
    remove: async (c) => {
      enqueue({ ...base, id: newId(), uid: c.uid, label: c.name, createdAt: new Date().toISOString(), kind: "delete" });
    },
    retry: (opId) => {
      saveOps(opsRef.current.map((o) => (o.id === opId ? ({ ...o, status: "pending", error: undefined } as Op) : o)));
      void sync();
    },
    discard: (opId) => {
      saveOps(opsRef.current.filter((o) => o.id !== opId));
      if (navigator.onLine && !opsRef.current.some((o) => o.status === "pending")) void pull().catch(() => {});
    },
  };
}
