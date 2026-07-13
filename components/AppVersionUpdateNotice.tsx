"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VersionState = {
  latestVersion: string;
  needsUpdate: boolean;
  error?: string;
};

const CURRENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "unknown";

export default function AppVersionUpdateNotice({ hasInputOpen = false }: { hasInputOpen?: boolean }) {
  const [versionState, setVersionState] = useState<VersionState | null>(null);
  const [updating, setUpdating] = useState(false);
  const versionCheckInFlightRef = useRef(false);
  const updateAttemptedOnLoadRef = useRef(false);

  const checkAppVersion = useCallback(async () => {
    if (versionCheckInFlightRef.current) return;
    versionCheckInFlightRef.current = true;
    try {
      const response = await fetch(`/api/version?_=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const result = await response.json();
      const latestVersion = typeof result.version === "string" ? result.version : "";
      if (!latestVersion) return;
      const needsUpdate = CURRENT_APP_VERSION === "unknown" || CURRENT_APP_VERSION !== latestVersion;
      setVersionState({
        latestVersion,
        needsUpdate,
        error: needsUpdate && updateAttemptedOnLoadRef.current ? updateFailureMessage() : undefined
      });
    } catch {
      // Version checks must never block operations.
    } finally {
      versionCheckInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    updateAttemptedOnLoadRef.current = url.searchParams.has("_appUpdate");
    if (url.searchParams.has("_appUpdate")) {
      url.searchParams.delete("_appUpdate");
      window.history.replaceState(null, "", url.toString());
    }

    void checkAppVersion();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkAppVersion();
    }, 10 * 60 * 1000);
    const checkOnActive = () => {
      if (document.visibilityState === "visible") void checkAppVersion();
    };
    document.addEventListener("visibilitychange", checkOnActive);
    window.addEventListener("focus", checkOnActive);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkOnActive);
      window.removeEventListener("focus", checkOnActive);
    };
  }, [checkAppVersion]);

  async function updateApplication() {
    if (hasInputOpen) {
      const confirmed = window.confirm("入力中の内容があります。\n更新すると入力内容が失われます。\n\n更新しますか？");
      if (!confirmed) return;
    }
    setUpdating(true);
    setVersionState((current) => current ? { ...current, error: undefined } : current);
    try {
      (window as Window & { __manualAppUpdateInProgress?: boolean }).__manualAppUpdateInProgress = true;
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(async (registration) => {
          await registration.update().catch(() => undefined);
          if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }));
      }
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.filter((name) => name.startsWith("driver-management-")).map((name) => caches.delete(name)));
      }
      const url = new URL(window.location.href);
      url.searchParams.set("_appUpdate", Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      (window as Window & { __manualAppUpdateInProgress?: boolean }).__manualAppUpdateInProgress = false;
      setUpdating(false);
      setVersionState((current) => ({
        latestVersion: current?.latestVersion ?? "",
        needsUpdate: true,
        error: updateFailureMessage()
      }));
    }
  }

  if (!versionState?.needsUpdate) return null;

  return (
    <section className="version-update-notice" aria-live="polite">
      <div>
        <p className="version-update-title">新しいバージョンがあります</p>
        <p className="muted">最新版に更新すると、古いPWA画面やキャッシュによる表示ずれを防げます。</p>
        <dl className="version-update-grid">
          <div><dt>現在</dt><dd>{CURRENT_APP_VERSION}</dd></div>
          <div><dt>最新</dt><dd>{versionState.latestVersion}</dd></div>
        </dl>
        {versionState.error && <p className="version-update-error">{versionState.error}</p>}
      </div>
      <div className="version-update-actions">
        <button className="button" type="button" disabled={updating} onClick={updateApplication}>
          {updating ? "更新中..." : "今すぐ更新"}
        </button>
      </div>
    </section>
  );
}

function updateFailureMessage() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "自動更新できませんでした。\nSafariでこの画面を開き直すか、ホーム画面のアプリを一度終了してから再起動してください。";
  }
  if (/Android/i.test(ua)) {
    return "自動更新できませんでした。\nChromeのメニューから再読み込みするか、ホーム画面のアプリを一度終了してから再起動してください。";
  }
  return "自動更新できませんでした。\nブラウザの再読み込みを行ってください。";
}
