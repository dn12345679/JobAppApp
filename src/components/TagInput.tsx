import { useEffect, useRef, useState } from "react";

export default function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  // Existing tags not yet added, narrowed by the current draft.
  const q = draft.trim().toLowerCase();
  const matches = suggestions.filter(
    (s) => !tags.includes(s) && (!q || s.toLowerCase().includes(q)),
  );
  const showMenu = focused && matches.length > 0;

  function addTag(value: string) {
    const v = value.trim();
    if (!v) return;
    // Append against the freshest prop; never drop existing tags.
    if (!tags.includes(v)) onChange([...tags, v]);
    setDraft("");
    setHighlight(-1);
  }

  // Close the menu (committing any typed draft) when a pointerdown lands
  // outside the widget. Selecting a suggestion is handled on mousedown below,
  // so this never races with a suggestion click.
  useEffect(() => {
    if (!focused) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        addTag(draft);
        setFocused(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, draft, tags]);

  return (
    <div ref={rootRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900/60 px-2 py-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
            {t}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-indigo-300 hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlight(-1);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, -1));
            } else if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(highlight >= 0 && matches[highlight] ? matches[highlight] : draft);
            } else if (e.key === "Escape") {
              setFocused(false);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder={tags.length ? "" : "Add tags…"}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-slate-100 outline-none"
        />
      </div>
      {showMenu && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-800 py-1 shadow-lg">
          {matches.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                // Select on mousedown: fires before the input can blur or the
                // scroll container can shift, so the choice always registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  i === highlight ? "bg-indigo-500/20 text-indigo-100" : "text-slate-200 hover:bg-slate-700"
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
