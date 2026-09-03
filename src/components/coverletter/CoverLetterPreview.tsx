import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CoverLetter } from "../../types";

// Letter dimensions at 96dpi (same as the résumé sheet) so the cover letter is a
// true, fixed-size page that scales via `zoom` — matching the résumé preview and
// fixing the previous fluid-width behaviour on small screens.
export const PAGE_W = 816;
export const PAGE_H = 1056;
const PAGE_PAD = 64;

const INK = "#111827";
const BODY = "#1f2937";
const MUTED = "#6b7280";

const FONT = 'Georgia, "Times New Roman", serif';
const BASE = 15;

const clampZoom = (z: number) =>
  Math.min(1.5, Math.max(0.4, Math.round(z * 10) / 10));

export const CoverSheet = ({
  ref,
  letter,
  bare,
}: {
  ref?: React.Ref<HTMLDivElement>;
  letter: CoverLetter;
  bare?: boolean;
}) => {
  const { contact, settings } = letter;
  const base = BASE * (settings.fontScale || 1);
  const lineHeight = 1.6 + (settings.lineSpacing || 0) / 20;
  const items = [contact.contact, contact.location].filter(Boolean);

  return (
    <div
      ref={ref}
      style={{
        width: PAGE_W,
        minHeight: PAGE_H,
        padding: PAGE_PAD,
        background: "#fff",
        color: BODY,
        fontFamily: FONT,
        fontSize: base,
        lineHeight,
        boxShadow: bare ? "none" : "0 1px 8px rgba(0,0,0,0.35)",
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <div style={{ fontSize: base * 1.7, fontWeight: 700, color: INK }}>
          {contact.fullName || "Your Name"}
        </div>
        {items.length > 0 && (
          <div style={{ fontSize: base * 0.85, color: MUTED, marginTop: 4 }}>
            {items.join("  ·  ")}
          </div>
        )}
      </header>
      <div style={{ whiteSpace: "pre-wrap" }}>{letter.body}</div>
    </div>
  );
};

export default function CoverLetterPreview({ letter }: { letter: CoverLetter }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetH, setSheetH] = useState(PAGE_H);
  const [zoom, setZoom] = useState(1.0);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => setSheetH(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [letter]);

  const pages = sheetH / PAGE_H;
  const fits = pages <= 1.001;

  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            fits
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-amber-500/20 text-amber-300"
          }`}
          title="Estimated printed length"
        >
          {fits ? "1 page" : `${pages.toFixed(2)} pages`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => clampZoom(z - 0.1))}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
            title="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => clampZoom(z + 0.1))}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="ml-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
            title="Reset to 100%"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div
          style={{ width: PAGE_W * zoom, height: sheetH * zoom, margin: "0 auto" }}
        >
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <CoverSheet ref={sheetRef} letter={letter} />
          </div>
        </div>
      </div>

      {createPortal(
        <div id="coverletter-print">
          <CoverSheet letter={letter} bare />
        </div>,
        document.body,
      )}
    </section>
  );
}
