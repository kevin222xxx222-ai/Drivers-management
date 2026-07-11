"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DriverLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [drivers, setDrivers] = useState<{ id: string; driverName: string }[]>([]);

  useEffect(() => {
    fetch("/api/public/drivers", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/driver-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        driverId: form.get("driverId"),
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
          <div className="login-brand">
            <h1>WOMANS GROUP</h1>
            <p className="login-subtitle">Driver Management System</p>
          </div>
          <p className="login-description">社内利用専用システムです。<br />登録済みドライバーのみ利用できます。</p>
        </div>
        <label>
          ドライバー名
          <select name="driverId" autoComplete="username" required defaultValue="">
            <option value="" disabled>選択してください</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.driverName}</option>)}
          </select>
        </label>
        <label>
          PIN（電話番号下4桁）
          <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" placeholder="電話番号下4桁を入力" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" type="submit">ログイン</button>
        <Link className="muted" href="/admin/login">管理者ログイン</Link>
        <footer className="login-footer">
          <span>© WOMANS GROUP</span>
          <span>Driver Management System</span>
          <span>Internal Use Only</span>
        </footer>
      </form>
    </main>
  );
}
