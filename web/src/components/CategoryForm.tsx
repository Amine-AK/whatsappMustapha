"use client";

import { useRef, useState, type FormEvent } from "react";
import { pictureToIcon } from "@/lib/image";
import type { Category } from "@/lib/ledger";
import { CategoryIcon } from "./CategoryIcon";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";
import { Field, parseAmount } from "./ui";

const EMOJIS = ["🧊", "📱", "🔌", "🛠️", "🍳", "📺", "💻", "🎧", "🔋", "💡", "🌀", "🔥", "🧺", "📷", "🎮", "⌚", "🖨️", "🚿", "🪑", "📦"];

/** Add a product family, or change one: name, picture or emoji, target margin. */
export function CategoryForm({
  data,
  category,
  onClose,
  onSaved,
}: {
  data: LedgerState;
  category?: Category;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const ledger = data.ledger!;
  const [v, setV] = useState({
    name: category?.name ?? "",
    description: category?.description ?? "",
    margin: category ? String(category.marginTarget || "") : "",
    icon: category?.icon ?? "📦",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPicture(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const icon = await pictureToIcon(file);
      setV((x) => ({ ...x, icon }));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "ما قدرناش نقراو هاد الصورة");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = v.name.trim();
    const margin = v.margin.trim() ? parseAmount(v.margin) : 0;
    if (!name) return setError("سمية الفئة ضرورية");
    if (!category && ledger.categories.some((c) => c.name === name)) return setError("هاد الفئة كاينة ديجا");
    if (!(margin >= 0 && margin <= 1000)) return setError("هامش الربح غير صحيح");
    data.run(`${category ? "تعديل" : "فئة جديدة"} · ${name}`, {
      type: "category.save",
      category: { name, description: v.description.trim(), marginTarget: margin, icon: v.icon },
    });
    onSaved(name);
  }

  const preview: Category = { name: v.name, description: "", marginTarget: 0, icon: v.icon };
  return (
    <Modal
      title={category ? `الفئة: ${category.name}` : "فئة جديدة"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="category-form" className="btn primary" disabled={busy}>
            حفظ
          </button>
        </>
      }
    >
      <form id="category-form" className="form-grid one-col" noValidate onSubmit={submit}>
        <div className="cat-preview">
          <span className="cat-tile on" aria-hidden="true">
            <CategoryIcon category={preview} className="cat-icon" />
            <span className="cat-name">{v.name.trim() || "سمية الفئة"}</span>
          </span>
        </div>
        <Field id="cat-name" label="سمية الفئة" hint={category ? "السمية ما كتبدلش (المبيعات القديمة مربوطة بيها)" : "مثلا: تلفزات، حواسيب، العناية الشخصية"}>
          <input id="cat-name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} disabled={Boolean(category)} autoFocus={!category} />
        </Field>
        <div className="field">
          <span>الأيقونة</span>
          <div className="emoji-grid" role="group" aria-label="اختار أيقونة">
            {EMOJIS.map((e) => (
              <button key={e} type="button" className={v.icon === e ? "on" : ""} aria-pressed={v.icon === e} onClick={() => setV((x) => ({ ...x, icon: e }))}>
                {e}
              </button>
            ))}
          </div>
          <div className="code-row">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "كنصغرو الصورة…" : "🖼️ ولا حط صورة"}
            </button>
            {v.icon.startsWith("data:") && (
              <button type="button" className="btn ghost" onClick={() => setV((x) => ({ ...x, icon: "📦" }))}>
                حيد الصورة
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPicture(e.target.files?.[0])} aria-label="صورة الفئة" />
          <span className="field-hint">الصورة كتصغر (96×96) وكتتحفظ فالـ Google Sheet.</span>
        </div>
        <Field id="cat-margin" label="هامش الربح المستهدف %" hint="اختياري · كيقترح ثمن البيع وكينبه إلا كان الربح قليل">
          <input id="cat-margin" inputMode="decimal" dir="ltr" value={v.margin} onChange={(e) => setV((x) => ({ ...x, margin: e.target.value }))} />
        </Field>
        <Field id="cat-description" label="الوصف" hint="اختياري">
          <input id="cat-description" value={v.description} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} />
        </Field>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
