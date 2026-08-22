import { useState } from "react";
import type { ResumeProfile, ResumeSettings } from "../../types";

// A Microsoft-Word-style menu bar for the résumé screen. "File" holds the
// document-level actions (New / Make a copy / Open previous / Export / Trash);
// "Edit" holds the typographic controls (font size, section & bullet spacing,
// find and replace). Each menu is a click-to-open dropdown closed by an
// invisible full-screen catcher.

type Menu = "file" | "edit" | null;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(v * 100) / 100));

export default function ResumeMenuBar({
  profile,
  savedAt,
  onNew,
  onMakeCopy,
  onOpenManager,
  onImport,
  onExportFile,
  onExportPdf,
  onSettings,
  onFindReplace,
}: {
  profile: ResumeProfile;
  savedAt: "idle" | "saving" | "saved";
  onNew: () => void;
  onMakeCopy: () => void;
  onOpenManager: () => void;
  onImport: () => void;
  onExportFile: () => void;
  onExportPdf: () => void;
  onSettings: (patch: Partial<ResumeSettings>) => void;
  onFindReplace: () => void;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const close = () => setMenu(null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const s = profile.settings;

  return (
    <div className="relative z-30 flex items-center gap-1 border-b border-slate-800 bg-slate-900/60 px-2 py-1 text-sm">
      <MenuButton
        label="File"
        open={menu === "file"}
        onToggle={() => setMenu(menu === "file" ? null : "file")}
      >
        <MenuItem onClick={run(onNew)}>New blank résumé</MenuItem>
        <MenuItem onClick={run(onMakeCopy)}>Make a copy…</MenuItem>
        <MenuItem onClick={run(onOpenManager)}>View / open previous…</MenuItem>
        <Divider />
        <MenuItem onClick={run(onImport)}>Import résumé…</MenuItem>
        <MenuItem onClick={run(onExportFile)}>Export résumé (.jtre)…</MenuItem>
        <MenuItem onClick={run(onExportPdf)}>Export to PDF…</MenuItem>
        <Divider />
        <MenuItem onClick={run(onOpenManager)}>Trash…</MenuItem>
      </MenuButton>

      <MenuButton
        label="Edit"
        open={menu === "edit"}
        onToggle={() => setMenu(menu === "edit" ? null : "edit")}
        wide
      >
        <Stepper
          label="Font size"
          value={s.fontScale ?? 1}
          display={`${Math.round((s.fontScale ?? 1) * 100)}%`}
          onDec={() => onSettings({ fontScale: clamp((s.fontScale ?? 1) - 0.05, 0.8, 1.3) })}
          onInc={() => onSettings({ fontScale: clamp((s.fontScale ?? 1) + 0.05, 0.8, 1.3) })}
          onReset={() => onSettings({ fontScale: 1 })}
        />
        <Stepper
          label="Space between sections"
          value={s.sectionSpacing ?? 0}
          display={`${(s.sectionSpacing ?? 0) > 0 ? "+" : ""}${s.sectionSpacing ?? 0}`}
          onDec={() => onSettings({ sectionSpacing: clamp((s.sectionSpacing ?? 0) - 2, -6, 24) })}
          onInc={() => onSettings({ sectionSpacing: clamp((s.sectionSpacing ?? 0) + 2, -6, 24) })}
          onReset={() => onSettings({ sectionSpacing: 0 })}
        />
        <Stepper
          label="Space between bullets"
          value={s.bulletSpacing ?? 0}
          display={`${(s.bulletSpacing ?? 0) > 0 ? "+" : ""}${s.bulletSpacing ?? 0}`}
          onDec={() => onSettings({ bulletSpacing: clamp((s.bulletSpacing ?? 0) - 1, -1, 10) })}
          onInc={() => onSettings({ bulletSpacing: clamp((s.bulletSpacing ?? 0) + 1, -1, 10) })}
          onReset={() => onSettings({ bulletSpacing: 0 })}
        />
        <Divider />
        <MenuItem onClick={run(onFindReplace)}>Find and replace…</MenuItem>
      </MenuButton>

      <span className="ml-2 truncate text-slate-400" title={profile.name}>
        {profile.name}
      </span>

      <span className="ml-auto pr-2 text-xs text-slate-500">
        {savedAt === "saving" ? "Saving…" : savedAt === "saved" ? "Saved" : ""}
      </span>

      {menu && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}
    </div>
  );
}

function MenuButton({
  label,
  open,
  onToggle,
  wide,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`rounded px-2.5 py-1 text-slate-200 hover:bg-slate-700/60 ${
          open ? "bg-slate-700/60" : ""
        }`}
      >
        {label}
      </button>
      {open && (
        <div
          className={`absolute left-0 top-full z-30 mt-1 ${
            wide ? "w-72" : "w-56"
          } rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-xl`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded px-2.5 py-1.5 text-left text-sm text-slate-200 hover:bg-indigo-600/80 hover:text-white"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-slate-700" />;
}

function Stepper({
  label,
  display,
  onDec,
  onInc,
  onReset,
}: {
  label: string;
  value: number;
  display: string;
  onDec: () => void;
  onInc: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex flex-none items-center gap-1">
        <StepBtn onClick={onDec} label={`Decrease ${label}`}>
          −
        </StepBtn>
        <button
          onClick={onReset}
          title="Reset"
          className="w-12 rounded text-center text-xs tabular-nums text-slate-400 hover:text-slate-200"
        >
          {display}
        </button>
        <StepBtn onClick={onInc} label={`Increase ${label}`}>
          +
        </StepBtn>
      </div>
    </div>
  );
}

function StepBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="h-6 w-6 rounded border border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400"
    >
      {children}
    </button>
  );
}
