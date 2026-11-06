"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { moveBy, resetMoves, resizeBy, type LabelSetup, type Part } from "@/lib/label-layout";

const PX_PER_MM = 96 / 25.4; // CSS pixels in a millimetre
const NAMES: Record<Part, string> = { shop: "سمية المحل", item: "سمية السلعة", price: "الثمن", code: "الباركود" };

/**
 * The sticker preview as an editor, like Canva: one finger (or the mouse)
 * moves a line, two fingers (or the mouse wheel) make it bigger or smaller.
 * The lines are the elements with `data-part` in `children`. `width`/`height`
 * are the size of what is shown, in mm; it is zoomed to fill the screen width.
 */
export function StickerEditor({
  setup,
  onChange,
  selected,
  onSelect,
  width,
  height,
  children,
}: {
  setup: LabelSetup;
  onChange: (s: LabelSetup) => void;
  selected: Part | null;
  onSelect: (p: Part | null) => void;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.5);
  // The latest values, for the pointer handlers.
  const latest = useRef({ setup, selected, zoom, onChange });
  latest.current = { setup, selected, zoom, onChange };

  // Zoomed to the width available (at most 3×).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fitZoom = () => setZoom(Math.max(1, Math.min(3, (el.clientWidth - 16) / (width * PX_PER_MM))));
    fitZoom();
    const ro = new ResizeObserver(fitZoom);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // Fingers on the sticker: id → last position.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; start: LabelSetup } | null>(null);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  function down(e: React.PointerEvent) {
    try {
      // Keep getting this finger's moves even when it leaves the sticker.
      box.current?.setPointerCapture(e.pointerId);
    } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      // The line under the first finger becomes the selected one (none: nothing selected).
      const part = (e.target as Element).closest<HTMLElement>("[data-part]")?.dataset.part as Part | undefined;
      onSelect(part ?? null);
      latest.current.selected = part ?? null;
    } else if (pointers.current.size === 2) {
      pinch.current = { dist: distance(), start: latest.current.setup };
    }
  }

  function move(e: React.PointerEvent) {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    const { setup: s, selected: part, zoom: z, onChange: change } = latest.current;
    if (!part) return;
    if (pointers.current.size >= 2 && pinch.current) {
      change(resizeBy(pinch.current.start, part, distance() / pinch.current.dist));
    } else if (pointers.current.size === 1) {
      const mm = (d: number) => d / (z * PX_PER_MM);
      change(moveBy(s, part, mm(now.x - last.x), mm(now.y - last.y)));
    }
  }

  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  // Mouse wheel on a PC: bigger / smaller (non-passive, so the page doesn't scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const { setup: s, selected: part, onChange: change } = latest.current;
      if (!part) return;
      e.preventDefault();
      change(resizeBy(s, part, e.deltaY < 0 ? 1.06 : 1 / 1.06));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const step = (k: number) => selected && onChange(resizeBy(setup, selected, k));
  const moved = Object.values(setup.moves).some((m) => m.x || m.y);

  return (
    <div className="sticker-editor-wrap">
      <div ref={box} className="sticker-editor" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="sticker-zoom" style={{ width: `${width * zoom}mm`, height: `${height * zoom}mm` }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: `${width}mm` }}>{children}</div>
        </div>
      </div>
      <div className="sticker-editor-bar">
        <span className="small muted">{selected ? `✋ ${NAMES[selected]}` : "لمس سطر باش تختارو"}</span>
        {selected && (
          <span className="sticker-editor-size" dir="ltr">
            <button type="button" className="btn icon-btn" onClick={() => step(1 / 1.1)} aria-label={`صغر ${NAMES[selected]}`}>
              −
            </button>
            <button type="button" className="btn icon-btn" onClick={() => step(1.1)} aria-label={`كبر ${NAMES[selected]}`}>
              +
            </button>
          </span>
        )}
        {moved && (
          <button type="button" className="link-btn" onClick={() => onChange(resetMoves(setup))}>
            ↺ رجع البلايص
          </button>
        )}
      </div>
      <p className="field-hint">إصبع واحد: حرك السطر · جوج صوابع: كبر ولا صغر (فالـ PC: الفأرة والـ molette).</p>
    </div>
  );
}
