"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PageData = {
  driver: any;
  businessDate: string;
  currentStatus: string;
  todayLogs: any[];
  availableActions: string[];
};

const labels: Record<string, string> = {
  CLOCK_IN: "出勤",
  START_RIDE: "送迎開始",
  ARRIVE: "現地到着",
  DROPOFF: "女性降車",
  WAIT_FIELD: "現地待機",
  WAIT_OFFICE: "事務所待機",
  CLOCK_OUT: "退勤",
  MAIL_CONFIRM_SEND: "送りメール確認",
  MAIL_CONFIRM_PICKUP: "迎えメール確認"
};

const locationActions = new Set(["CLOCK_IN", "START_RIDE", "ARRIVE", "DROPOFF", "WAIT_FIELD", "WAIT_OFFICE", "CLOCK_OUT"]);

export default function DriverPage() {
  const router = useRouter();
  const [data, setData] = useState<PageData | null>(null);
  const [action, setAction] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [distance, setDistance] = useState("");
  const [preview, setPreview] = useState<any>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/driver/mypage", { cache: "no-store" });
    if (response.status === 401) return router.push("/login");
    setData(await response.json());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (action !== "CLOCK_OUT") return setPreview(null);
    const query = distance ? `?distance=${encodeURIComponent(distance)}` : "";
    fetch(`/api/driver/clock-out-preview${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [action, distance]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    if (!window.confirm(`${labels[action]}を登録します。よろしいですか？`)) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const location = locationActions.has(action) ? await getLocationPayload() : {};
    const response = await fetch("/api/driver/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, ...location, action })
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(result.error ?? "保存できませんでした。");
    setAction("");
    setDistance("");
    setMessage("保存しました。");
    await load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const needsForm = useMemo(() => ["CLOCK_IN", "START_RIDE", "ARRIVE", "DROPOFF", "WAIT_FIELD", "WAIT_OFFICE", "CLOCK_OUT"].includes(action), [action]);

  if (!data) return <main className="page">読み込み中...</main>;

  return (
    <main className="page">
      <div className="shell stack">
        <div className="between">
          <div>
            <h1>{data.driver.driverName}</h1>
            <p className="muted">営業日 {data.businessDate}</p>
          </div>
          <button className="button secondary" onClick={logout}>ログアウト</button>
        </div>

        <section className="panel stack">
          <p className="muted">現在ステータス</p>
          <div className="status">{data.currentStatus}</div>
          <div className="action-grid">
            {data.availableActions.map((item) => (
              <button key={item} className="button" onClick={() => setAction(item)}>{labels[item]}</button>
            ))}
          </div>
        </section>

        {action && (
          <section className="panel stack">
            <div className="between">
              <h2>{labels[action]}</h2>
              <button className="button secondary" onClick={() => setAction("")}>閉じる</button>
            </div>
            {needsForm ? (
              <form className="stack" onSubmit={submit}>
                <ActionFields action={action} gasSettlementType={data.driver.gasSettlementType} distance={distance} setDistance={setDistance} />
                {preview && <SettlementPreview preview={preview} />}
                {message && <p className={message === "保存しました。" ? "success" : "error"}>{message}</p>}
                <button className="button" disabled={loading} type="submit">{loading ? "保存中..." : "登録"}</button>
              </form>
            ) : (
              <form className="stack" onSubmit={submit}>
                {message && <p className="error">{message}</p>}
                <button className="button" disabled={loading} type="submit">{loading ? "保存中..." : "通知する"}</button>
              </form>
            )}
          </section>
        )}

        <section className="panel stack">
          <h2>本日履歴</h2>
          <LogTable logs={data.todayLogs} />
        </section>
      </div>
    </main>
  );
}

function ActionFields({ action, gasSettlementType, distance, setDistance }: any) {
  if (action === "CLOCK_IN") {
    return (
      <>
        <label>退勤予定時刻<input name="scheduledClockOut" type="datetime-local" required /></label>
        <label>メモ<textarea name="memo" /></label>
      </>
    );
  }
  if (action === "START_RIDE") {
    return (
      <>
        <label>種別<select name="type" required><option value="送り">送り</option><option value="迎え">迎え</option><option value="事務所戻り">事務所戻り</option><option value="その他">その他</option></select></label>
        <label>キャスト名<input name="castName" /></label>
        <label>目的地<input name="destination" required /></label>
        <label>移動時間分数<input name="travelMinutes" type="number" min="1" required /></label>
        <label>メモ<textarea name="memo" /></label>
      </>
    );
  }
  if (action === "CLOCK_OUT") {
    return (
      <>
        <label>日報<textarea name="dailyReport" required /></label>
        {gasSettlementType === "SEPARATE" && <label>走行距離 km<input name="distance" type="number" step="0.1" min="0" required value={distance} onChange={(event) => setDistance(event.target.value)} /></label>}
        <label>メモ<textarea name="memo" /></label>
      </>
    );
  }
  return <label>メモ<textarea name="memo" /></label>;
}

function SettlementPreview({ preview }: { preview: any }) {
  return (
    <div className="card panel">
      <h3>精算見込み</h3>
      <p>稼働時間：{preview.workHours}h / 時給小計：{Number(preview.wageSubtotal).toLocaleString()}円</p>
      <p>ガス代小計：{Number(preview.gasSubtotal).toLocaleString()}円 / 合計：{Number(preview.totalPayment).toLocaleString()}円</p>
    </div>
  );
}

function LogTable({ logs }: { logs: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>時刻</th><th>操作</th><th>状態</th><th>種別</th><th>目的地</th><th>メモ</th></tr></thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.datetime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</td>
              <td>{labels[log.action] ?? log.action}</td>
              <td>{log.status}</td>
              <td>{log.type ?? ""}</td>
              <td>{log.destination ?? ""}</td>
              <td>{log.memo ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function getLocationPayload() {
  if (!("geolocation" in navigator)) return {};
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60_000
      });
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString()
    };
  } catch {
    return {};
  }
}
