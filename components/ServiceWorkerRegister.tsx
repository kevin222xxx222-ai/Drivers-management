"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    installServerActionMismatchGuard();
    installPwaInstallDiagnostics();

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.update().catch(() => undefined);

      if (registration.waiting && navigator.serviceWorker.controller) {
        promptForReload(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            promptForReload(worker);
          }
        });
      });
    }).catch(() => undefined);
  }, []);
  return null;
}

function promptForReload(worker: ServiceWorker) {
  const confirmed = window.confirm("新しいバージョンがあります。画面を再読み込みして更新しますか？");
  if (confirmed) worker.postMessage({ type: "SKIP_WAITING" });
}

function installPwaInstallDiagnostics() {
  if ((window as Window & { __pwaInstallDiagnostics?: boolean }).__pwaInstallDiagnostics) return;
  (window as Window & { __pwaInstallDiagnostics?: boolean }).__pwaInstallDiagnostics = true;
  const debug = new URLSearchParams(window.location.search).get("pwaDebug") === "1" || localStorage.getItem("PWA_DEBUG") === "true";
  const log = (message: string, data?: unknown) => {
    if (debug) console.info(`[pwa] ${message}`, data ?? "");
  };

  log("diagnostics enabled", {
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    serviceWorker: "serviceWorker" in navigator,
    protocol: window.location.protocol
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    (window as Window & { __pwaInstallPromptEvent?: Event }).__pwaInstallPromptEvent = event;
    log("beforeinstallprompt fired");
  });

  window.addEventListener("appinstalled", () => {
    log("appinstalled fired");
  });
}

function installServerActionMismatchGuard() {
  if ((window as Window & { __serverActionMismatchGuard?: boolean }).__serverActionMismatchGuard) return;
  (window as Window & { __serverActionMismatchGuard?: boolean }).__serverActionMismatchGuard = true;

  const reloadOnce = () => {
    if (sessionStorage.getItem("server-action-mismatch-reloaded") === "1") return;
    sessionStorage.setItem("server-action-mismatch-reloaded", "1");
    window.location.reload();
  };

  window.addEventListener("error", (event) => {
    if (String(event.message ?? "").includes("Failed to find Server Action")) reloadOnce();
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (String(event.reason?.message ?? event.reason ?? "").includes("Failed to find Server Action")) reloadOnce();
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.ok || sessionStorage.getItem("server-action-mismatch-reloaded") === "1") return response;
    response.clone().text().then((text) => {
      if (text.includes("Failed to find Server Action")) reloadOnce();
    }).catch(() => undefined);
    return response;
  };
}
