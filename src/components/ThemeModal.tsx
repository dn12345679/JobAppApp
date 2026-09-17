import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ModalPortal from "./ModalPortal";
import { THEMES, applyTheme, type ThemeDef } from "../lib/theme";
import {
  BACKGROUNDS,
  applyBackground,
  getSavedBackground,
  type BackgroundDef,
} from "../lib/background";

interface ThemeModalProps {
  currentTheme: string;
  onThemeChange: (id: string) => void;
  onClose: () => void;
}

type TabKey = "themes" | "background";
type FilterKey = "all" | "dark" | "light";

export default function ThemeModal({
  currentTheme,
  onThemeChange,
  onClose,
}: ThemeModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("themes");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Track effective theme and pending theme for smooth interpolation delay
  const [effectiveTheme, setEffectiveTheme] = useState(currentTheme);
  const [pendingTheme, setPendingTheme] = useState<string | null>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track background state and pending background
  const [currentBg, setCurrentBg] = useState(getSavedBackground());
  const [pendingBg, setPendingBg] = useState<string | null>(null);
  const applyBgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEffectiveTheme(currentTheme);
  }, [currentTheme]);

  // Clean up any pending transition timers on unmount
  useEffect(() => {
    return () => {
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current);
      }
      if (applyBgTimerRef.current) {
        clearTimeout(applyBgTimerRef.current);
      }
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredThemes = THEMES.filter((t) => {
    if (filter === "dark") return t.mode === "dark";
    if (filter === "light") return t.mode === "light";
    return true;
  });

  const activeId = pendingTheme || effectiveTheme;
  const activeThemeDef = THEMES.find((t) => t.id === activeId) || THEMES[0];

  const activeBgId = pendingBg || currentBg;
  const activeBgDef =
    BACKGROUNDS.find((b) => b.id === activeBgId) || BACKGROUNDS[0];

  function handleSelectTheme(themeId: string) {
    if (themeId === effectiveTheme && !pendingTheme) return;

    // 1. Immediate visual feedback on the card
    setPendingTheme(themeId);

    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
    }

    // 2. Add transition interpolation delay before applying the full document theme change
    applyTimerRef.current = setTimeout(() => {
      applyTheme(themeId, true);
      onThemeChange(themeId);
      setEffectiveTheme(themeId);
      setPendingTheme(null);
    }, 130);
  }

  function handleSelectBackground(bgId: string) {
    if (bgId === currentBg && !pendingBg) return;

    // 1. Immediate visual feedback on the card
    setPendingBg(bgId);

    if (applyBgTimerRef.current) {
      clearTimeout(applyBgTimerRef.current);
    }

    // 2. Add transition interpolation delay before applying the full background change
    applyBgTimerRef.current = setTimeout(() => {
      applyBackground(bgId, true);
      setCurrentBg(bgId);
      setPendingBg(null);
    }, 130);
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Modal Dialog with layout transition interpolation speed for smooth resizing */}
        <motion.div
          layout
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          transition={{
            duration: 0.22,
            ease: [0.4, 0, 0.2, 1],
            layout: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
          }}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 flex h-[620px] max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-700/80 px-6 pt-5 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4.5 w-4.5"
                  >
                    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Appearance & Customization
                  </h2>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700/60 hover:text-slate-100 transition-colors"
              title="Close (Esc)"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Navigation Tabs with synchronized transition interpolation */}
          <div className="flex items-center gap-1 border-b border-slate-700/80 px-6 pt-2 bg-slate-900/40">
            <button
              onClick={() => setActiveTab("themes")}
              className={`relative flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium transition-colors ${activeTab === "themes"
                ? "text-slate-100"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <span>Themes</span>
              <span className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-300">
                {THEMES.length}
              </span>
              {activeTab === "themes" && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                  transition={{
                    type: "spring",
                    stiffness: 450,
                    damping: 34,
                    mass: 0.8,
                  }}
                />
              )}
            </button>

            <button
              onClick={() => setActiveTab("background")}
              className={`relative flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium transition-colors ${activeTab === "background"
                ? "text-slate-100"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <span>Background Image</span>
              <span className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-300">
                {BACKGROUNDS.length}
              </span>
              {activeTab === "background" && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                  transition={{
                    type: "spring",
                    stiffness: 450,
                    damping: 34,
                    mass: 0.8,
                  }}
                />
              )}
            </button>
          </div>

          {/* Tab Content Container with smooth AnimatePresence transition */}
          <div className="flex flex-1 flex-col overflow-hidden relative">
            <AnimatePresence mode="wait">
              {activeTab === "themes" ? (
                <motion.div
                  key="themes"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-col flex-1 overflow-hidden"
                >
                  {/* Category Filter Pills */}
                  <div className="flex items-center justify-between px-6 pt-3.5 pb-2">
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: "all", label: "All Themes", count: THEMES.length },
                          {
                            id: "dark",
                            label: "Dark",
                            count: THEMES.filter((t) => t.mode === "dark").length,
                          },
                          {
                            id: "light",
                            label: "Light",
                            count: THEMES.filter((t) => t.mode === "light").length,
                          },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setFilter(f.id)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${filter === f.id
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                            }`}
                        >
                          {f.label} ({f.count})
                        </button>
                      ))}
                    </div>

                    <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
                      <span>Active theme:</span>
                      <span className="flex items-center gap-1.5 font-medium text-slate-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: activeThemeDef.swatch }}
                        />
                        {activeThemeDef.label}
                      </span>
                    </div>
                  </div>

                  {/* Theme Cards Grid */}
                  <div className="flex-1 overflow-y-auto px-6 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                      {filteredThemes.map((t) => (
                        <ThemeCard
                          key={t.id}
                          theme={t}
                          isActive={t.id === activeId}
                          onSelect={() => handleSelectTheme(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* Background Image Options Grid */
                <motion.div
                  key="background"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-col flex-1 overflow-hidden"
                >
                  {/* Background Info Bar */}
                  <div className="flex items-center justify-between px-6 pt-3.5 pb-2">

                    <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
                      <span>Active background:</span>
                      <span className="font-medium text-slate-200">
                        {activeBgDef.name}
                      </span>
                    </div>
                  </div>

                  {/* Background Cards Grid */}
                  <div className="flex-1 overflow-y-auto px-6 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                      {BACKGROUNDS.map((bg) => (
                        <BackgroundCard
                          key={bg.id}
                          bg={bg}
                          isActive={bg.id === activeBgId}
                          onSelect={() => handleSelectBackground(bg.id)}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-700/80 bg-slate-900/50 px-6 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>
                {activeTab === "themes"
                  ? `Active Theme: ${activeThemeDef.label}`
                  : `Active Background: ${activeBgDef.name}`}
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </ModalPortal>
  );
}

// Miniature UI Simulation Card for each Theme
function ThemeCard({
  theme,
  isActive,
  onSelect,
}: {
  theme: ThemeDef;
  isActive: boolean;
  onSelect: () => void;
}) {
  const p = theme.palette;
  const isAero = theme.id === "aero";

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col rounded-xl border p-3 cursor-pointer transition-all duration-150 ${isActive
        ? "border-indigo-500 bg-slate-700/40 shadow-md ring-1 ring-indigo-500/50"
        : "border-slate-700/80 bg-slate-800/80 hover:border-slate-600 hover:bg-slate-700/30"
        }`}
    >
      {/* Miniature UI Mockup */}
      <div
        className="relative mb-3 h-28 w-full overflow-hidden rounded-lg border transition-transform duration-150 group-hover:scale-[1.01]"
        style={{
          backgroundColor: p.bg,
          borderColor: p.line,
          background: isAero
            ? "linear-gradient(180deg, #7cc0ee 0%, #a7dbf3 42%, #d7f0ea 100%)"
            : p.bg,
        }}
      >
        {/* Simulated Top Bar */}
        <div
          className="flex h-6 items-center justify-between border-b px-2"
          style={{
            backgroundColor: isAero ? "rgba(255, 255, 255, 0.75)" : p.surface2,
            borderColor: isAero ? "rgba(255, 255, 255, 0.5)" : p.line,
          }}
        >
          {/* Simulated Window Dots */}
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-rose-400 opacity-80" />
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400 opacity-80" />
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-80" />
          </div>

          {/* Mini Nav Links */}
          <div className="flex items-center gap-1.5">
            <div
              className="h-1.5 w-6 rounded-full opacity-60"
              style={{ backgroundColor: p.ink }}
            />
            <div
              className="h-1.5 w-4 rounded-full opacity-35"
              style={{ backgroundColor: p.ink }}
            />
          </div>

          {/* Simulated User Pill */}
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: theme.swatch }}
          />
        </div>

        {/* Simulated Card Content inside UI */}
        <div className="p-2 space-y-1.5">
          <div
            className="rounded border p-1.5 shadow-xs"
            style={{
              backgroundColor: isAero ? "rgba(255, 255, 255, 0.85)" : p.surface,
              borderColor: isAero ? "rgba(255, 255, 255, 0.8)" : p.line,
              boxShadow: isAero ? "0 2px 6px rgba(26, 86, 140, 0.15)" : undefined,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div
                className="h-2 w-14 rounded-xs font-bold"
                style={{ backgroundColor: p.ink, opacity: 0.9 }}
              />
              <span
                className="rounded px-1 text-[8px] font-semibold"
                style={{
                  backgroundColor: `${p.accent}25`,
                  color: p.accent,
                }}
              >
                Applied
              </span>
            </div>

            <div
              className="h-1.5 w-20 rounded-xs mb-1.5 opacity-60"
              style={{ backgroundColor: p.ink }}
            />

            <div className="flex items-center justify-between pt-0.5">
              <div
                className="h-1.5 w-8 rounded-xs opacity-40"
                style={{ backgroundColor: p.ink }}
              />
              <div
                className="rounded px-1.5 py-0.5 text-[7px] font-medium text-white"
                style={{
                  backgroundColor: p.accent,
                  backgroundImage: isAero
                    ? "linear-gradient(180deg, #62bdf6 0%, #2b8fd8 50%, #1d78c4 100%)"
                    : undefined,
                }}
              >
                View
              </div>
            </div>
          </div>
        </div>

        {/* Active Badge Overlay */}
        {isActive && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className="h-2.5 w-2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Active
          </div>
        )}
      </div>

      {/* Theme Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border border-black/10 shadow-xs"
            style={{ backgroundColor: theme.swatch }}
          />
          <h4 className="text-sm font-semibold text-slate-100">{theme.label}</h4>
        </div>

        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${theme.mode === "dark"
            ? "bg-slate-900 text-slate-300 border border-slate-700"
            : "bg-slate-200 text-slate-800 border border-slate-300"
            }`}
        >
          {theme.mode}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-xs text-slate-400 leading-snug">
        {theme.description}
      </p>

      {/* Palette Color Swatches */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-700/60 pt-2">
        <div className="flex items-center gap-1.5">
          <div
            className="h-3.5 w-3.5 rounded-full border border-slate-600"
            style={{ backgroundColor: p.bg }}
            title="Page Background"
          />
          <div
            className="h-3.5 w-3.5 rounded-full border border-slate-600"
            style={{ backgroundColor: p.surface }}
            title="Surface"
          />
          <div
            className="h-3.5 w-3.5 rounded-full border border-slate-600"
            style={{ backgroundColor: p.accent }}
            title="Accent"
          />
          <div
            className="h-3.5 w-3.5 rounded-full border border-slate-600"
            style={{ backgroundColor: p.ink }}
            title="Text Ink"
          />
        </div>

        <span className="text-[11px] font-medium text-slate-400 group-hover:text-indigo-400 transition-colors">
          {isActive ? "Selected" : "Select →"}
        </span>
      </div>
    </div>
  );
}

// Background Card Component
function BackgroundCard({
  bg,
  isActive,
  onSelect,
}: {
  bg: BackgroundDef;
  isActive: boolean;
  onSelect: () => void;
}) {
  const isNone = bg.id === "none";

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col rounded-xl border p-3 cursor-pointer transition-all duration-150 ${isActive
        ? "border-indigo-500 bg-slate-700/40 shadow-md ring-1 ring-indigo-500/50"
        : "border-slate-700/80 bg-slate-800/80 hover:border-slate-600 hover:bg-slate-700/30"
        }`}
    >
      {/* Background Preview Container */}
      <div className="relative mb-3 h-28 w-full overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/60">
        {isNone ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 to-slate-900 text-slate-400 group-hover:text-slate-300 transition-colors">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-8 w-8 text-slate-500 group-hover:text-indigo-400 transition-colors"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span className="text-[11px] font-medium">Default Color</span>
          </div>
        ) : (
          <img
            src={bg.thumbUrl || bg.url!}
            alt={bg.name}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        )}

        {/* Active Badge Overlay */}
        {isActive && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className="h-2.5 w-2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Active
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-100">{bg.name}</h4>
        <span className="rounded-md bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-600/50">
          {isNone ? "Theme Solid" : bg.artist}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-400 leading-snug">
        {isNone
          ? "Use the solid background color defined by the active theme."
          : `Photo by ${bg.artist}.`}
      </p>

      {/* Footer / Action */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-700/60 pt-2">
        <span className="text-[11px] text-slate-500">
          {isNone ? "Standard mode" : "Cover wallpaper"}
        </span>
        <span className="text-[11px] font-medium text-slate-400 group-hover:text-indigo-400 transition-colors">
          {isActive ? "Selected" : "Select →"}
        </span>
      </div>
    </div>
  );
}
