"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client";
import { ROLE_LABEL, SELLER_SERVICES, type Role, type Service } from "@/lib/roles";
import { Modal } from "./Modal";
import { Field } from "./ui";

interface User {
  id: string;
  name: string;
  login: string;
  role: Role;
  services: Service[];
  seeCost: boolean;
  active: boolean;
  createdAt: string;
}

const MIN_PASSWORD = 8;

/** Owner only: employee accounts and what each one can do. */
export function UsersDialog({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);

  async function load() {
    try {
      setUsers((await apiFetch<{ users: User[] }>("/api/users")).users);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (editing) {
    return (
      <UserForm
        user={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          onToast(msg);
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <Modal
      title="👥 المستخدمين والصلاحيات"
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={() => setEditing("new")}>
          ＋ حساب جديد
        </button>
      }
    >
      <p className="muted small">
        المالك كيدخل بـ <bdi dir="ltr">owner</bdi> وكلمة السر ديال التطبيق. الحسابات الأخرى كتتسجل فورقة «المستخدمين» (كلمات السر مشفرة).
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!users && !error && <p className="muted">كنجيبو الحسابات…</p>}
      {users && users.length === 0 && <p className="empty small">ما كاين حتى حساب ديال خدام. زيد واحد.</p>}
      {users && users.length > 0 && (
        <ul className="cat-list">
          {users.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => setEditing(u)} aria-label={`تعديل ${u.name}`}>
                <span className="cat-list-icon" aria-hidden="true">
                  {u.role === "owner" ? "👑" : u.role === "stock" ? "📦" : "🧑‍💼"}
                </span>
                <span className="cat-list-name">
                  <strong>
                    {u.name} {!u.active && <span className="pill">موقوف</span>}
                  </strong>
                  <span className="muted small">
                    <bdi dir="ltr">{u.login}</bdi> · {ROLE_LABEL[u.role]}
                    {u.role === "seller" ? ` · ${u.services.length} خدمة` : ""}
                    {u.role !== "owner" && u.seeCost ? " · كيشوف ثمن الشراء" : ""}
                  </span>
                </span>
                <span className="muted small">تعديل</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function UserForm({ user, onClose, onSaved }: { user?: User; onClose: () => void; onSaved: (msg: string) => void }) {
  const [v, setV] = useState({
    name: user?.name ?? "",
    login: user?.login ?? "",
    role: (user?.role ?? "seller") as Role,
    services: user?.services ?? (["sell_cash", "sell_credit", "payment", "client_add"] as Service[]),
    seeCost: user?.seeCost ?? false,
    active: user?.active ?? true,
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (k: Service) => setV((x) => ({ ...x, services: x.services.includes(k) ? x.services.filter((s) => s !== k) : [...x.services, k] }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setError("السمية ضرورية");
    if (!/^[^\s]{3,30}$/.test(v.login.trim())) return setError("اسم الدخول: من 3 حتى 30 حرف، بلا فراغات");
    if (!user && !v.password) return setError("كلمة السر ضرورية");
    if (v.password && v.password.length < MIN_PASSWORD) return setError(`كلمة السر خاصها ${MIN_PASSWORD} حروف على الأقل`);
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/users", { method: "POST", body: { ...v, id: user?.id, password: v.password || undefined } });
      onSaved(user ? "تبدل الحساب" : `تزاد الحساب «${v.name.trim()}»`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={user ? `الحساب: ${user.name}` : "حساب جديد"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            رجوع
          </button>
          <button type="submit" form="user-form" className="btn primary" disabled={busy}>
            {busy ? "…" : "حفظ"}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid one-col" noValidate onSubmit={submit}>
        <Field id="u-name" label="السمية">
          <input id="u-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus={!user} />
        </Field>
        <Field id="u-login" label="اسم الدخول" hint="هادا اللي كيكتب ملي كيدخل · بلا فراغات">
          <input id="u-login" dir="ltr" autoCapitalize="none" spellCheck={false} value={v.login} onChange={(e) => setV({ ...v, login: e.target.value })} />
        </Field>
        <Field id="u-password" label={user ? "كلمة سر جديدة" : "كلمة السر"} hint={user ? `خليها خاوية باش ما تتبدلش · ${MIN_PASSWORD} حروف على الأقل` : `${MIN_PASSWORD} حروف على الأقل`}>
          <input id="u-password" type="text" dir="ltr" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        </Field>
        <div className="field">
          <span>الدور</span>
          <div className="segmented wide-seg" role="group" aria-label="الدور">
            {(["seller", "stock", "owner"] as Role[]).map((r) => (
              <button key={r} type="button" className={v.role === r ? "on" : ""} aria-pressed={v.role === r} onClick={() => setV({ ...v, role: r })}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <span className="field-hint">
            {v.role === "owner"
              ? "كيدير كلشي، بحالك."
              : v.role === "stock"
                ? "كيزيد السلع للمخزون وكيقلب عليها فقط."
                : "كيشوف الزبناء والكريدي ديالهم، والخدمات اللي تختار هنا."}
          </span>
        </div>
        {v.role === "seller" && (
          <fieldset className="services">
            <legend>الخدمات</legend>
            {SELLER_SERVICES.map((s) => (
              <label key={s.key} className="check">
                <input type="checkbox" checked={v.services.includes(s.key)} onChange={() => toggle(s.key)} />
                {s.label}
              </label>
            ))}
          </fieldset>
        )}
        {v.role !== "owner" && (
          <label className="check">
            <input type="checkbox" checked={v.seeCost} onChange={(e) => setV({ ...v, seeCost: e.target.checked })} />
            يشوف ثمن الشراء والربح
          </label>
        )}
        {user && (
          <label className="check">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
            الحساب مفعل (حيد العلامة باش توقفو)
          </label>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
