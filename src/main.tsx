import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { applyTheme, getSavedTheme } from "./lib/theme";
import "./index.css";
import "./themes.css";

// Apply the saved theme before first paint to avoid a flash.
applyTheme(getSavedTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
