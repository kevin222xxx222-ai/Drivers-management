"use client";

import { useEffect, useState } from "react";

const minimumDisplayMs = 900;
const fadeMs = 180;
const storageKey = "driver-management-pwa-splash-shown";

export default function AppSplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!isStandaloneMode()) return;
    if (sessionStorage.getItem(storageKey) === "1") return;
    sessionStorage.setItem(storageKey, "1");

    const startedAt = Date.now();
    setVisible(true);

    const finish = () => {
      const remaining = Math.max(0, minimumDisplayMs - (Date.now() - startedAt));
      window.setTimeout(() => {
        setLeaving(true);
        window.setTimeout(() => setVisible(false), fadeMs);
      }, remaining);
    };

    if (document.readyState === "complete") {
      finish();
    } else {
      window.addEventListener("load", finish, { once: true });
    }

    const fallback = window.setTimeout(finish, 1200);
    return () => {
      window.removeEventListener("load", finish);
      window.clearTimeout(fallback);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`app-splash${leaving ? " app-splash-hide" : ""}`} aria-label="アプリを読み込み中">
      <div className="app-splash-logo" aria-hidden="true">
        <span>WG</span>
      </div>
      <p className="app-splash-title">WOMANS GROUP</p>
      <p className="app-splash-subtitle">Driver Management System</p>
    </div>
  );
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
