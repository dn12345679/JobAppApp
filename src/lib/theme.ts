// Theme registry. Add a preset by defining a [data-theme="id"] block in
// themes.css and adding a matching entry here. Selection is stored per device
// (localStorage) and never synced.

export interface ThemeDef {
  id: string;
  label: string;
  swatch: string; // accent color shown in the menu
}

export const THEMES: ThemeDef[] = [
  { id: "midnight", label: "Midnight", swatch: "#6366f1" },
  { id: "ocean", label: "Ocean", swatch: "#06b6d4" },
  { id: "plum", label: "Plum", swatch: "#a855f7" },
  { id: "light", label: "Light", swatch: "#4f46e5" },
];

const KEY = "ui-theme";

export function getSavedTheme(): string {
  const t = localStorage.getItem(KEY);
  return t && THEMES.some((x) => x.id === t) ? t : "midnight";
}

export function applyTheme(id: string): void {
  const root = document.documentElement;
  // "midnight" is the default :root — no data-theme attribute.
  if (id === "midnight") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", id);
  localStorage.setItem(KEY, id);
}
