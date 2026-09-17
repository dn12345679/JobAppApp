// Theme registry. Add a preset by defining a [data-theme="id"] block in
// themes.css and adding a matching entry here. Selection is stored per device
// (localStorage) and never synced.

export interface ThemeDef {
  id: string;
  label: string;
  swatch: string; // accent color shown in the menu
  mode: "dark" | "light";
  description: string;
  palette: {
    bg: string;
    surface: string;
    surface2: string;
    line: string;
    ink: string;
    accent: string;
  };
}

export const THEMES: ThemeDef[] = [
  {
    id: "midnight",
    label: "Midnight",
    swatch: "#6366f1",
    mode: "dark",
    description: "Default dark theme with deep navy and vibrant indigo accents",
    palette: {
      bg: "#0b1120",
      surface: "#1e293b",
      surface2: "#0f172a",
      line: "#334155",
      ink: "#f1f5f9",
      accent: "#4f46e5",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "#06b6d4",
    mode: "dark",
    description: "Deep marine cyan with bright aqua accents",
    palette: {
      bg: "#071820",
      surface: "#123443",
      surface2: "#0b2530",
      line: "#1d4d60",
      ink: "#edf8fc",
      accent: "#0891b2",
    },
  },
  {
    id: "plum",
    label: "Plum",
    swatch: "#a855f7",
    mode: "dark",
    description: "Atmospheric eggplant purple with vivid violet accents",
    palette: {
      bg: "#160f1f",
      surface: "#2a1c42",
      surface2: "#1e1430",
      line: "#402b5f",
      ink: "#f5eefb",
      accent: "#9333ea",
    },
  },
  {
    id: "light",
    label: "Light",
    swatch: "#4f46e5",
    mode: "light",
    description: "Clean, high-contrast light slate with indigo accents",
    palette: {
      bg: "#eef2f7",
      surface: "#ffffff",
      surface2: "#f8fafc",
      line: "#e2e8f0",
      ink: "#0f172a",
      accent: "#4f46e5",
    },
  },
  {
    id: "butter",
    label: "Butter",
    swatch: "#deb53a",
    mode: "light",
    description: "Warm, cozy cream and soothing honey tones",
    palette: {
      bg: "#ffefc4",
      surface: "#f8efd4",
      surface2: "#faecc8",
      line: "#f2dfb0",
      ink: "#433c1b",
      accent: "#dbba50",
    },
  },
  {
    id: "sakura",
    label: "Sakura",
    swatch: "#db4f8a",
    mode: "light",
    description: "Soft cherry-blossom blush pink with rosy plum accents",
    palette: {
      bg: "#fdf1f5",
      surface: "#ffffff",
      surface2: "#fbe6ee",
      line: "#f4cfdc",
      ink: "#45262f",
      accent: "#db4f8a",
    },
  },
  {
    id: "aero",
    label: "Aero",
    swatch: "#2b8fd8",
    mode: "light",
    description: "Frutiger Aero aesthetic with glossy glass, sheen, and sky blue",
    palette: {
      bg: "#bfe3f8",
      surface: "#eaf6ff",
      surface2: "#dceffb",
      line: "#a9d3ef",
      ink: "#0e3350",
      accent: "#2b8fd8",
    },
  },
];

const KEY = "ui-theme";

export function getSavedTheme(): string {
  const t = localStorage.getItem(KEY);
  return t && THEMES.some((x) => x.id === t) ? t : "midnight";
}

let transitionTimer: ReturnType<typeof setTimeout> | null = null;

export function applyTheme(id: string, animate = false): void {
  const root = document.documentElement;

  // Clear any residual inline background-color so CSS tokens take full effect
  root.style.removeProperty("background-color");
  if (document.body) {
    document.body.style.removeProperty("background-color");
  }

  // Only add smooth transition class when explicitly animating (e.g. user theme switch in modal)
  if (animate) {
    root.classList.add("theme-transitioning");
  }

  // "midnight" is the default :root — no data-theme attribute.
  if (id === "midnight") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", id);
  localStorage.setItem(KEY, id);

  if (animate) {
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      root.classList.remove("theme-transitioning");
      transitionTimer = null;
    }, 280);
  }
}
