import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PORTA_BASE_PATH } from "./basePath";
import "./index.css";
import App from "./App";

// ── Reload Tracing Instrumentation ──
if (typeof window !== "undefined") {
  // Check if we previously logged a reload event before unload
  try {
    const lastReloadReason = sessionStorage.getItem("porta_last_reload_reason");
    if (lastReloadReason) {
      console.warn("🚨 [RELOAD_DEBUGGER] Page recovered after reload!");
      console.warn(lastReloadReason);
      sessionStorage.removeItem("porta_last_reload_reason");
    }
  } catch {
    // ignore
  }

  // Intercept window.location.reload
  try {
    const originalReload = window.location.reload.bind(window.location);
    (window.location as unknown as Record<string, unknown>).reload = function (...args: unknown[]) {
      const err = new Error("window.location.reload() called");
      const info = `[RELOAD_DEBUGGER] window.location.reload() called at ${new Date().toISOString()}\nStack:\n${err.stack}`;
      console.error(info);
      try {
        sessionStorage.setItem("porta_last_reload_reason", info);
      } catch {
        // ignore
      }
      return (originalReload as (...a: unknown[]) => unknown)(...args);
    };
  } catch {
    // ignore
  }

  // Listen to beforeunload
  window.addEventListener("beforeunload", () => {
    const info = `[RELOAD_DEBUGGER] beforeunload event triggered at ${new Date().toISOString()} | activeElement: ${document.activeElement?.tagName || "none"}`;
    console.info(info);
    try {
      if (!sessionStorage.getItem("porta_last_reload_reason")) {
        sessionStorage.setItem("porta_last_reload_reason", info);
      }
    } catch {
      // ignore
    }
  });

  // Listen to ServiceWorker controllerchange
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const info = `[RELOAD_DEBUGGER] Service worker controllerchange event fired at ${new Date().toISOString()}`;
      console.warn(info);
      try {
        sessionStorage.setItem("porta_last_reload_reason", info);
      } catch {
        // ignore
      }
    });
  }

  // Listen to Vite HMR full reloads
  if (import.meta.hot) {
    import.meta.hot.on("vite:beforeFullReload", (payload) => {
      const info = `[RELOAD_DEBUGGER] Vite beforeFullReload fired at ${new Date().toISOString()} | payload: ${JSON.stringify(payload)}`;
      console.warn(info);
      try {
        sessionStorage.setItem("porta_last_reload_reason", info);
      } catch {
        // ignore
      }
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={PORTA_BASE_PATH}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
