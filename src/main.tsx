import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { applyTheme, getSavedTheme } from "./lib/theme";
import "./index.css";

// Apply the saved theme before first paint to avoid a flash.
applyTheme(getSavedTheme(), false);

// Only load background module if a custom wallpaper is actually saved
const savedBg = localStorage.getItem("ui-background");
if (savedBg && savedBg !== "none") {
  import("./lib/background").then(({ applyBackground }) => {
    applyBackground(savedBg, false);
  });
}

// Belt-and-suspenders for disabling pinch-zoom on Android WebViews that ignore
// the viewport's user-scalable=no (index.html). The app has no two-finger
// gestures, so blocking multi-touch moves kills pinch-zoom without affecting
// single-finger scrolling. Scaling stays exclusively on the in-app Zoom control.
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
