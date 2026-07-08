"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DriverLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/driver-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        driverName: form.get("driverName"),
        pin: form.get("pin")
      })
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "ログインできません。");
    router.push("/driver");
  }

  return (
    <main className="login-shell">
      <form className="panel login-card stack" onSubmit={submit}>
        <div className="stack">
          <h1>ドライバーログイン</h1>
          <p className="muted">DriverName + PIN</p>
        </div>
        <label>
          ドライバー名
          <input name="driverName" autoComplete="username" required />
        </label>
        <label>
          PIN
          <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" type="submit">ログイン</button>
        <Link className="muted" href="/admin/login">管理者ログイン</Link>
      </form>
    </main>
  );
}
