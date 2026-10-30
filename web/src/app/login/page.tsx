"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/login", { method: "POST", body: { password } });
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
          <label htmlFor="password">كلمة السر</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary block" disabled={busy || !password}>
          {busy ? "…" : "دخول"}
        </button>
      </form>
    </main>
  );
}
