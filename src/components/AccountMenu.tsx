import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../auth/AuthContext";
import { THEMES, applyTheme, getSavedTheme } from "../lib/theme";

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
  const [theme, setTheme] = useState(getSavedTheme());

  function pickTheme(id: string) {
    applyTheme(id);
    setTheme(id);
  }

  return (
    <div className="relative">
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
          <span>⚙</span>
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

              {/* Theme */}
              <div className="px-1 py-1.5">
                <div className="mb-1.5 text-sm text-slate-300">Theme</div>
                <div className="flex flex-wrap gap-1.5">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickTheme(t.id)}
                      title={t.label}
                      className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs ${
                        t.id === theme
                          ? "border-indigo-500 text-slate-100"
                          : "border-slate-700 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: t.swatch }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {user && (
                <>
                  <div className="my-1 border-t border-slate-700" />
                  <button
                    onClick={async () => {
                      setShowMenu(false);
                      await signOut();
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                  >
                    Sign out
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
