"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch("/api/me?type=ADMIN", { cache: "no-store", credentials: "same-origin" });
        if (!active) return;
        if (response.ok) {
          const user = await response.json();
          if (user.userType === "ADMIN") {
            router.replace("/admin");
            return;
          }
        }
      } catch {
        // Show the login form when auth status cannot be confirmed.
      } finally {
        if (active) setAuthChecking(false);
      }
    }
    checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/admin-login", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        adminId: form.get("adminId"),
        password: form.get("password")
      })
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "ログインできません。");
    router.push("/admin");
  }

  return (
    <main className="login-shell">
      <form className="panel login-card stack" onSubmit={submit}>
        <div className="stack">
          <div className="login-brand">
            <h1>WOMANS GROUP</h1>
            <p className="login-subtitle">運行管理システム 管理者ページ</p>
          </div>
          <p className="login-description">社内利用専用システムです。</p>
        </div>
        {authChecking ? (
          <p className="muted">ログイン状態を確認中です...</p>
        ) : (
          <>
            <label>
              AdminID
              <input name="adminId" autoComplete="username" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="button" type="submit">ログイン</button>
            <Link className="muted" href="/login">ドライバーログイン</Link>
          </>
        )}
        <footer className="login-footer">
          <span>© WOMANS GROUP</span>
          <span>Driver Management System</span>
          <span>Internal Use Only</span>
        </footer>
      </form>
    </main>
  );
}
