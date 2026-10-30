"use client";

// Minimal key/value store on IndexedDB, used to keep customers and unsent
// changes on the device. Falls back to memory if IndexedDB is unavailable
// (private browsing on some phones): the app still works, but forgets on close.

const DB_NAME = "electro-lmestour";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memory.get(key) as T | undefined;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(memory.get(key) as T | undefined);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
