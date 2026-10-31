"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client";
import { idbGet, idbSet } from "@/lib/idb";
import {
  applyOps,
  newLedgerId,
  normalizeLedger,
  summarize,
  type ClientSummary,
  type Ledger,
  type LedgerOp,
  type OpResult,
} from "@/lib/ledger";
import { todayISO } from "@/lib/sheet-logic";

const SNAPSHOT_KEY = "ledger-snapshot";
const QUEUE_KEY = "ledger-queue";
const RETRY_EVERY_MS = 30_000;
const BATCH = 50;

/** A change made on this device, waiting to reach the sheet (or refused). */
export interface Queued {
  op: LedgerOp;
  /** "دفعة 500 درهم · محمد…", shown in the list of unsent changes. */
  label: string;
  status: "pending" | "failed";
  error?: string;
}

interface Snapshot {
  ledger: Ledger;
  fetchedAt: string;
}

type OpInput = LedgerOp extends infer T ? (T extends LedgerOp ? Omit<T, "opId" | "at"> : never) : never;

export interface LedgerState {
  /** Ledger with the unsent changes already applied. */
  ledger: Ledger | null;
  summaries: ClientSummary[];
  today: string;
  online: boolean;
  syncing: boolean;
  needsSetup: boolean;
  pendingCount: number;
  failed: Queued[];
  lastSync: string | null;
  loadError: string;
  syncError: string;
  /** Record changes (saved on the device at once, sent to the sheet in order). */
  run: (label: string, ...ops: OpInput[]) => void;
  refresh: () => Promise<void>;
  /** Send a refused change again; an edit is re-based on the sheet's current version. */
  retry: (opId: string) => void;
  discard: (opId: string) => void;
}

function isTemporary(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 401 || e.status === 429 || e.status >= 500);
}

let lastAt = 0;
/** Strictly increasing time stamps: two changes in the same millisecond stay distinct. */
function stamp(): string {
  lastAt = Math.max(Date.now(), lastAt + 1);
  return new Date(lastAt).toISOString();
}

export function useLedger(): LedgerState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [today, setToday] = useState(() => todayISO());

  const snapRef = useRef<Snapshot | null>(null);
  const queueRef = useRef<Queued[]>([]);
  const running = useRef(false);

  const saveSnapshot = useCallback((s: Snapshot) => {
    snapRef.current = s;
    setSnapshot(s);
    void idbSet(SNAPSHOT_KEY, s);
  }, []);

  const saveQueue = useCallback((q: Queued[]) => {
    queueRef.current = q;
    setQueue(q);
    void idbSet(QUEUE_KEY, q);
  }, []);

  const pull = useCallback(async () => {
    const data = await apiFetch<{ ledger?: Ledger; today: string; needsSetup?: boolean }>("/api/data");
    setToday(data.today);
    if (data.needsSetup) {
      setNeedsSetup(true);
      return;
    }
    setNeedsSetup(false);
    saveSnapshot({ ledger: normalizeLedger(data.ledger), fetchedAt: new Date().toISOString() });
    setLoadError("");
  }, [saveSnapshot]);

  const sync = useCallback(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    setSyncing(true);
    setSyncError("");
    try {
      for (;;) {
        const pending = queueRef.current.filter((q) => q.status === "pending").slice(0, BATCH);
        if (!pending.length) break;
        let results: { opId: string; result: OpResult; message?: string }[];
        try {
          ({ results } = await apiFetch<{ results: typeof results }>("/api/sync", { method: "POST", body: { ops: pending.map((q) => q.op) } }));
        } catch (e) {
          if (isTemporary(e)) {
            setSyncError(e instanceof Error ? e.message : String(e));
            return; // keep everything, try again later
          }
          // The whole batch was refused (should not happen): mark it so it doesn't block the rest.
          const msg = e instanceof Error ? e.message : String(e);
          const ids = new Set(pending.map((q) => q.op.opId));
          saveQueue(queueRef.current.map((q) => (ids.has(q.op.opId) ? { ...q, status: "failed", error: msg } : q)));
          continue;
        }
        const byId = new Map(results.map((r) => [r.opId, r]));
        saveQueue(
          queueRef.current.flatMap((q) => {
            const r = byId.get(q.op.opId);
            if (!r) return [q];
            if (r.result === "ok" || r.result === "already") return [];
            return [{ ...q, status: "failed" as const, error: r.message || (r.result === "conflict" ? "تعارض" : "مرفوض") }];
          }),
        );
      }
      await pull();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
      if (!snapRef.current) setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [pull, saveQueue]);

  // Start: show what is on the device at once, then sync.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [snap, saved] = await Promise.all([idbGet<Snapshot>(SNAPSHOT_KEY), idbGet<Queued[]>(QUEUE_KEY)]);
      if (cancelled) return;
      if (snap) {
        // Saved by an older version of the app: add the lists it didn't have.
        const fixed = { ...snap, ledger: normalizeLedger(snap.ledger) };
        snapRef.current = fixed;
        setSnapshot(fixed);
      }
      queueRef.current = saved ?? [];
      setQueue(queueRef.current);
      setOnline(navigator.onLine);
      setLoaded(true);
      if (navigator.onLine) await sync();
      else if (!snap) setLoadError("ما كاينش الأنترنيت، وهادي أول مرة كتحل فيها التطبيق فهاد الجهاز. حلو مرة وحدة بالأنترنيت.");
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setToday(todayISO());
      if (navigator.onLine) void sync();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (navigator.onLine && queueRef.current.some((q) => q.status === "pending")) void sync();
    }, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [sync]);

  const ledger = useMemo(() => {
    if (!loaded || !snapshot) return null;
    return applyOps(snapshot.ledger, queue.filter((q) => q.status === "pending").map((q) => q.op));
  }, [loaded, snapshot, queue]);

  const summaries = useMemo(() => (ledger ? summarize(ledger, today) : []), [ledger, today]);

  return {
    ledger,
    summaries,
    today,
    online,
    syncing,
    needsSetup,
    pendingCount: queue.filter((q) => q.status === "pending").length,
    failed: queue.filter((q) => q.status === "failed"),
    lastSync: snapshot?.fetchedAt ?? null,
    loadError: ledger ? "" : loadError,
    syncError,
    run: (label, ...ops) => {
      const items = ops.map((o) => ({ op: { ...o, opId: newLedgerId("O"), at: stamp() } as LedgerOp, label, status: "pending" as const }));
      saveQueue([...queueRef.current, ...items]);
      void sync();
    },
    refresh: async () => {
      if (navigator.onLine) await sync();
    },
    retry: (opId) => {
      const current = snapRef.current?.ledger;
      saveQueue(
        queueRef.current.map((q) => {
          if (q.op.opId !== opId) return q;
          const op = { ...q.op } as LedgerOp;
          // Re-base an edit on what the sheet holds now (the user chose to apply it anyway).
          if (current && "base" in op) {
            const list = op.type.startsWith("client")
              ? current.clients
              : op.type.startsWith("purchase")
                ? current.purchases
                : op.type.startsWith("stock")
                  ? current.stock
                  : current.payments;
            const rec = list.find((r) => r.id === op.id);
            if (rec) op.base = rec.updatedAt;
          }
          return { ...q, op, status: "pending", error: undefined };
        }),
      );
      void sync();
    },
    discard: (opId) => saveQueue(queueRef.current.filter((q) => q.op.opId !== opId)),
  };
}
