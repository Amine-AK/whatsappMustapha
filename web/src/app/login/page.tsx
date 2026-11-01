"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client";
import { idbClearLedger, idbGet, idbSet } from "@/lib/idb";
import type { Me } from "@/lib/roles";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { me } = await apiFetch<{ me: Me }>("/api/login", { method: "POST", body: { login, password } });
      // Another person on this device: their copy of the data stays theirs.
      if ((await idbGet<string>("ledger-owner")) !== me.id) {
        await idbClearLedger();
        await idbSet("ledger-owner", me.id);
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-mark big" aria-hidden="true">
          ⚡
        </span>
        <h1>ELECTRO-LMESTOUR</h1>
        <p className="muted">كريدي الزبناء</p>
        <div className="field">
          <label htmlFor="login">اسم الدخول</label>
          <input
            id="login"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">كلمة السر</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary block" disabled={busy || !password || !login.trim()}>
          {busy ? "…" : "دخول"}
        </button>
      </form>
    </main>
  );
}
