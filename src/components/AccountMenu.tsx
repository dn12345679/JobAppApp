import { useState, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../auth/AuthContext";
import { THEMES, getSavedTheme } from "../lib/theme";
import { checkForUpdate } from "../lib/updater";

const ThemeModal = lazy(() => import("./ThemeModal"));

export default function AccountMenu({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  const { user, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [theme, setTheme] = useState(getSavedTheme());
  const [checking, setChecking] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const currentThemeDef = THEMES.find((t) => t.id === theme) || THEMES[0];

  async function runUpdateCheck() {
    setChecking(true);
    setUpdateMsg(null);
    const r = await checkForUpdate();
    setChecking(false);
    if (r.kind === "uptodate") setUpdateMsg("You’re on the latest version.");
    else if (r.kind === "declined") setUpdateMsg(`Update ${r.version} is available.`);
    else if (r.kind === "error") setUpdateMsg("Couldn’t check, try again later.");
    // "installing" → the app relaunches, so no message needed.
  }


  return (
    // z-40: above the résumé File/Edit band (z-30) but below modal backdrops (z-50).
    <div className="relative z-40">
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-600"
      >
        {user ? (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="max-w-[10rem] truncate">{user.email}</span>
          </>
        ) : (
          <span></span>
        )}
      </button>
      <AnimatePresence>
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-700 bg-slate-800 p-2 shadow-xl"
            >
              {user && (
                <div className="truncate px-1 pb-2 text-xs text-slate-500">
                  {user.email}
                </div>
              )}

              {/* Zoom */}
              <div className="flex items-center justify-between px-1 py-1.5">
                <span className="text-sm text-slate-300">Zoom</span>
                <div className="flex items-center gap-1 rounded-lg border border-slate-700 px-1 py-0.5">
                  <button
                    onClick={onZoomOut}
                    disabled={zoom <= 0.8}
                    className="h-6 w-6 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                  >
                    −
                  </button>
                  <button
                    onClick={onZoomReset}
                    title="Reset (Ctrl+0)"
                    className="w-11 text-center text-xs text-slate-400 hover:text-slate-200"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={onZoomIn}
                    disabled={zoom >= 2}
                    className="h-6 w-6 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Theme & Appearance */}
              <div className="px-1 py-1">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowThemeModal(true);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-black/20"
                      style={{ background: currentThemeDef.swatch }}
                    />
                    <span>Theme & Appearance</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <span>{currentThemeDef.label}</span>
                    <span className="text-slate-500">›</span>
                  </span>
                </button>
              </div>

              <div className="my-1 border-t border-slate-700" />
              <button
                onClick={runUpdateCheck}
                disabled={checking}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-70"
              >
                <span>Check for updates</span>
                {checking && (
                  <span
                    aria-label="Checking"
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-indigo-400"
                  />
                )}
              </button>
              {updateMsg && (
                <div className="px-2 pb-1 text-xs text-slate-500">{updateMsg}</div>
              )}
              {user && (
                <button
                  onClick={async () => {
                    setShowMenu(false);
                    await signOut();
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                >
                  Sign out
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showThemeModal && (
          <Suspense fallback={null}>
            <ThemeModal
              currentTheme={theme}
              onThemeChange={(newTheme) => setTheme(newTheme)}
              onClose={() => setShowThemeModal(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
