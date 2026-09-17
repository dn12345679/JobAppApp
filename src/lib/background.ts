export interface BackgroundDef {
  id: string;
  name: string;
  artist: string;
  url: string | null;
  thumbUrl?: string | null;
}

export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: "none",
    name: "No Background",
    artist: "Default theme color",
    url: null,
    thumbUrl: null,
  },
  {
    id: "cherry_dylan",
    name: "Cherry",
    artist: "Dylan",
    url: new URL("../assets/BG/compressed/cherry_dylan.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/cherry_dylan.webp", import.meta.url).href,
  },
  {
    id: "grotto_dylan",
    name: "Grotto",
    artist: "Dylan",
    url: new URL("../assets/BG/compressed/grotto_dylan.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/grotto_dylan.webp", import.meta.url).href,
  },
  {
    id: "mars_kjpargeter",
    name: "Mars",
    artist: "KJ Pargeter",
    url: new URL("../assets/BG/compressed/mars_kjpargeter.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/mars_kjpargeter.webp", import.meta.url).href,
  },
  {
    id: "panthercreek_dylan",
    name: "Panther Creek",
    artist: "Dylan",
    url: new URL("../assets/BG/compressed/panthercreek_dylan.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/panthercreek_dylan.webp", import.meta.url).href,
  },
  {
    id: "park_dylan",
    name: "Park",
    artist: "Dylan",
    url: new URL("../assets/BG/compressed/park_dylan.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/park_dylan.webp", import.meta.url).href,
  },
  {
    id: "poolroom_kiwirico",
    name: "Poolroom",
    artist: "Kiwirico",
    url: new URL("../assets/BG/compressed/poolroom_kiwirico.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/poolroom_kiwirico.webp", import.meta.url).href,
  },
  {
    id: "starrysky_seanpierce",
    name: "Starry Sky",
    artist: "Sean Pierce",
    url: new URL("../assets/BG/compressed/starrysky_seanpierce.webp", import.meta.url).href,
    thumbUrl: new URL("../assets/BG/thumbs/starrysky_seanpierce.webp", import.meta.url).href,
  },
];

const KEY = "ui-background";

export function getSavedBackground(): string {
  const saved = localStorage.getItem(KEY);
  return saved && BACKGROUNDS.some((b) => b.id === saved) ? saved : "none";
}

let bgTransitionTimer: ReturnType<typeof setTimeout> | null = null;

export function applyBackground(id: string, animate = false): void {
  const root = document.documentElement;
  const bg = BACKGROUNDS.find((b) => b.id === id);

  if (animate) {
    root.classList.add("theme-transitioning");
  }

  if (!bg || !bg.url || id === "none") {
    // Revert to the default theme solid background
    root.removeAttribute("data-has-bg-image");
    root.style.removeProperty("--bg-image");
    document.body.style.removeProperty("background-image");
    document.body.style.removeProperty("background-size");
    document.body.style.removeProperty("background-position");
    document.body.style.removeProperty("background-attachment");
    document.body.style.removeProperty("background-repeat");
    localStorage.setItem(KEY, "none");
  } else {
    // Enable custom background wallpaper without destroying the --bg color token
    root.setAttribute("data-has-bg-image", "true");
    root.style.setProperty("--bg-image", `url("${bg.url}")`);
    document.body.style.backgroundImage = `url("${bg.url}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
    document.body.style.backgroundRepeat = "no-repeat";
    localStorage.setItem(KEY, id);
  }

  if (animate) {
    if (bgTransitionTimer) clearTimeout(bgTransitionTimer);
    bgTransitionTimer = setTimeout(() => {
      root.classList.remove("theme-transitioning");
      bgTransitionTimer = null;
    }, 280);
  }
}
