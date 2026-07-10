"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/admin-login", {
      method: "POST",
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
          <h1>管理者ログイン</h1>
        </div>
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
      </form>
    </main>
  );
}
