"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PageData = {
  driver: any;
  businessDate: string;
  currentStatus: string;
  scheduledClockOut?: string | null;
  latestStatusLog?: any | null;
  latestRideLog?: any | null;
  latestClockInLog?: any | null;
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
  MAIL_CONFIRM_PICKUP: "迎えメール確認",
  UPDATE_SCHEDULED_CLOCK_OUT: "退勤予定変更",
  ADMIN_STATUS_CORRECTION: "管理者代理修正"
};

const locationActions = new Set(["CLOCK_IN", "START_RIDE", "ARRIVE", "DROPOFF", "WAIT_FIELD", "WAIT_OFFICE", "CLOCK_OUT"]);
const formActions = new Set(["CLOCK_IN", "START_RIDE", "CLOCK_OUT"]);

const confirmMessages: Record<string, string> = {
  ARRIVE: "現地到着として登録しますか？",
  DROPOFF: "女性降車済みとして登録しますか？",
  WAIT_FIELD: "現地待機として登録しますか？",
  WAIT_OFFICE: "事務所待機として登録しますか？",
  MAIL_CONFIRM_SEND: "送りメール確認を通知しますか？",
  MAIL_CONFIRM_PICKUP: "迎えメール確認を通知しますか？"
};

export default function DriverPage() {
  const router = useRouter();
  const [data, setData] = useState<PageData | null>(null);
  const [action, setAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingAction, setProcessingAction] = useState("");
  const [distance, setDistance] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledClockOut, setScheduledClockOut] = useState("");
  const [rideType, setRideType] = useState("送り");
  const [historyLimit, setHistoryLimit] = useState(5);

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
    fetch(`/api/driver/clock-out-preview${query}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [action, distance]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(action || scheduleOpen));
    return () => document.body.classList.remove("modal-open");
  }, [action, scheduleOpen]);

  function clearMessages() {
    setErrorMessage("");
  }

  function openAction(nextAction: string) {
    clearMessages();
    setDistance("");
    setRideType("送り");
    setAction(nextAction);
  }

  function openScheduleEdit() {
    clearMessages();
    setScheduledClockOut(toLocalInputValue(data?.scheduledClockOut));
    setScheduleOpen(true);
  }

  async function saveScheduledClockOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduledClockOut) return setErrorMessage("退勤予定日時を入力してください。");
    if (!window.confirm("退勤予定日時を変更します。よろしいですか？")) return;
    const startedAt = performance.now();
    setLoading(true);
    setProcessingAction("UPDATE_SCHEDULED_CLOCK_OUT");
    clearMessages();
    try {
      const apiStartedAt = performance.now();
      const response = await fetch("/api/driver/scheduled-clock-out", {
        method: "PATCH",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduledClockOut })
      });
      const result = await response.json().catch(() => ({}));
      const apiMs = performance.now() - apiStartedAt;
      if (!response.ok) {
        setErrorMessage(result.error ? `保存できませんでした。${result.error}` : "保存できませんでした。");
        return;
      }
      setScheduleOpen(false);
      if (result.state) {
        setData(result.state);
        measureCardUpdate("UPDATE_SCHEDULED_CLOCK_OUT", startedAt, apiMs);
      }
      void load();
    } catch {
      setErrorMessage("保存できませんでした。通信が完了しませんでした。");
    } finally {
      setLoading(false);
      setProcessingAction("");
    }
  }

  async function handleActionClick(nextAction: string) {
    clearMessages();
    if (formActions.has(nextAction)) return openAction(nextAction);
    const confirmMessage = confirmMessages[nextAction] ?? `${labels[nextAction]}を登録しますか？`;
    if (!window.confirm(confirmMessage)) return;
    await saveAction(nextAction);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    if (!window.confirm(`${labels[action]}を登録します。よろしいですか？`)) return;
    const form = new FormData(event.currentTarget);
    await saveAction(action, Object.fromEntries(form.entries()));
  }

  async function saveAction(targetAction: string, body: Record<string, FormDataEntryValue> = {}) {
    const startedAt = performance.now();
    setLoading(true);
    setProcessingAction(targetAction);
    clearMessages();
    try {
      const location = locationActions.has(targetAction) ? await getLocationPayload() : {};
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      const apiStartedAt = performance.now();
      const response = await fetch("/api/driver/logs", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...location, action: targetAction }),
        signal: controller.signal
      });
      window.clearTimeout(timeout);
      const result = await response.json().catch(() => ({}));
      const apiMs = performance.now() - apiStartedAt;
      if (!response.ok) {
        setErrorMessage(result.error ? `保存できませんでした。${result.error}` : "保存できませんでした。");
        return;
      }
      setAction("");
      setScheduleOpen(false);
      setDistance("");
      if (result.state) {
        setData(result.state);
        measureCardUpdate(targetAction, startedAt, apiMs);
      }
      void load();
    } catch {
      setErrorMessage("保存できませんでした。通信が完了しませんでした。");
    } finally {
      setLoading(false);
      setProcessingAction("");
    }
  }

  async function logout() {
    await fetch("/api/auth/driver-logout", { method: "POST", cache: "no-store" });
    router.push("/login");
  }

  function measureCardUpdate(targetAction: string, startedAt: number, apiMs: number) {
    window.requestAnimationFrame(() => {
      const totalMs = performance.now() - startedAt;
      performance.mark(`driver-action-${targetAction}-updated`);
      if (window.localStorage.getItem("PERFORMANCE_LOGGING") === "true") {
        console.info("[driver-action]", {
          action: targetAction,
          apiMs: Math.round(apiMs),
          buttonToCardMs: Math.round(totalMs)
        });
      }
    });
  }

  if (!data) return <main className="page">読み込み中...</main>;
  const usableActions = data.availableActions.filter((item) => item !== "DROPOFF" || Boolean(data.latestRideLog?.castName));
  const primaryActions = mainActionsFor(data.currentStatus, data.latestRideLog).filter((item) => usableActions.includes(item));
  const subActions = usableActions.filter((item) => !primaryActions.includes(item) && item !== "CLOCK_OUT");
  const isWorking = !["未出勤", "退勤済み"].includes(data.currentStatus);
  const visibleLogs = data.todayLogs.slice(0, historyLimit);

  return (
    <main className="page">
      <div className="shell stack">
        <div className="driver-hero">
          <div>
            <h1>{data.driver.driverName}</h1>
            <p className="muted">営業日 {formatBusinessDateWithWeekday(data.businessDate)}</p>
            {isWorking && (
              <div className={`scheduled-chip ${scheduledStatusClass(data.scheduledClockOut)}`}>
                <span>退勤予定</span>
                <strong>{formatMonthDayTime(data.scheduledClockOut)}</strong>
                {scheduledStatusText(data.scheduledClockOut) && <em>{scheduledStatusText(data.scheduledClockOut)}</em>}
                <button className="link-button" type="button" onClick={openScheduleEdit}>変更</button>
              </div>
            )}
          </div>
          {isWorking ? <button className="button danger" disabled={loading} onClick={() => openAction("CLOCK_OUT")}>{processingAction === "CLOCK_OUT" ? "登録中..." : "退勤"}</button> : <button className="button secondary" onClick={logout}>ログアウト</button>}
        </div>

        <StatusGuide data={data} />

        {!!primaryActions.length && (
          <section className="panel stack">
            <p className="section-label">次の操作</p>
            <div className="main-action-grid">
              {primaryActions.map((item) => <button key={item} className="button main-action-button" disabled={loading} onClick={() => handleActionClick(item)}>{processingAction === item ? "登録中..." : labels[item]}</button>)}
            </div>
          </section>
        )}

        {!!subActions.length && (
          <section className="panel stack compact-panel">
            <p className="section-label">その他の操作</p>
            <div className="action-grid">
              {subActions.map((item) => <button key={item} className="button secondary" disabled={loading} onClick={() => handleActionClick(item)}>{processingAction === item ? "登録中..." : labels[item]}</button>)}
            </div>
          </section>
        )}

        {errorMessage && (
          <p className="error">{errorMessage}</p>
        )}

        {action && (
          <FormModal title={labels[action]} onClose={() => { clearMessages(); setAction(""); }}>
            <form className="stack modal-form" onSubmit={submit}>
              <ActionFields action={action} gasSettlementType={data.driver.gasSettlementType} distance={distance} setDistance={setDistance} rideType={rideType} setRideType={setRideType} />
              {preview && <SettlementPreview preview={preview} />}
              <div className="modal-actions">
                <button className="button" disabled={loading} type="submit">{processingAction === action ? "登録中..." : "登録"}</button>
              </div>
            </form>
          </FormModal>
        )}

        {scheduleOpen && (
          <FormModal title="退勤予定変更" onClose={() => setScheduleOpen(false)}>
            <form className="stack modal-form" onSubmit={saveScheduledClockOut}>
              <label>退勤予定日時<input type="datetime-local" required value={scheduledClockOut} onChange={(event) => setScheduledClockOut(event.target.value)} /></label>
              <div className="modal-actions">
                <button className="button" disabled={loading} type="submit">{processingAction === "UPDATE_SCHEDULED_CLOCK_OUT" ? "登録中..." : "保存"}</button>
              </div>
            </form>
          </FormModal>
        )}

        <section className="panel stack">
          <h2>本日履歴</h2>
          <LogTable logs={visibleLogs} />
          {historyLimit < data.todayLogs.length ? (
            <button className="button secondary" type="button" onClick={() => setHistoryLimit((current) => current + 5)}>もっと見る</button>
          ) : data.todayLogs.length > 5 ? (
            <p className="muted">これ以上ありません</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ActionFields({ action, gasSettlementType, distance, setDistance, rideType, setRideType }: any) {
  if (action === "CLOCK_IN") {
    return (
      <label>退勤予定時刻<input name="scheduledClockOut" type="datetime-local" required /></label>
    );
  }
  if (action === "START_RIDE") {
    return (
      <>
        <label>種別<select name="type" required value={rideType} onChange={(event) => setRideType(event.target.value)}><option value="送り">送り</option><option value="迎え">迎え</option><option value="事務所戻り">事務所戻り</option><option value="その他">その他</option></select></label>
        <label>キャスト名<input name="castName" required={rideType === "送り" || rideType === "迎え"} /></label>
        {rideType === "事務所戻り" ? <input name="destination" type="hidden" value="事務所" /> : <label>目的地<input name="destination" required /></label>}
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
      </>
    );
  }
  return null;
}

function StatusGuide({ data }: { data: PageData }) {
  const status = data.currentStatus;
  const log = data.latestStatusLog;
  const ride = data.latestRideLog;
  const infoLog = ["送り中", "迎え中", "戻り中", "その他"].includes(status) ? ride : log;
  const lines: string[] = [];

  if (["送り中", "迎え中", "戻り中", "その他"].includes(status)) {
    if (status === "戻り中") {
      lines.push("事務所へ移動中");
    } else {
      const details = [infoLog?.castName ? `キャスト：${infoLog.castName}` : "", infoLog?.destination ? `目的地：${infoLog.destination}` : ""].filter(Boolean);
      if (details.length) lines.push(details.join(" / "));
    }
    lines.push(`出発 ${formatTime(infoLog?.datetime)} / 到着予定 ${formatTime(infoLog?.estimatedArrival)} / あと${minutesUntilText(infoLog?.estimatedArrival)}`);
  } else if (status === "現地到着") {
    lines.push(`到着時刻：${formatTime(log?.actualArrival ?? log?.datetime)}`);
  } else if (status === "女性降車済み") {
    lines.push(`降車時刻：${formatTime(log?.dropoffTime ?? log?.datetime)}`);
  } else if (status === "現地待機") {
    lines.push(`待機開始 ${formatTime(log?.datetime)}`);
  } else if (status === "事務所待機") {
    lines.push(`待機開始 ${formatTime(log?.datetime)}`);
  } else if (status === "退勤済み") {
    lines.push("本日の業務は終了しています。");
  }

  return (
    <section className={`panel stack status-guide ${statusClass(status)}`}>
      <div className="status-guide-title">{statusIcon(status)} {status}</div>
      {!!lines.length && <div className="status-guide-lines">{lines.map((line) => <p key={line}>{line}</p>)}</div>}
    </section>
  );
}

function SettlementPreview({ preview }: { preview: any }) {
  return (
    <div className="settlement-preview">
      <h3>精算見込み</h3>
      <dl>
        <div><dt>出勤時刻</dt><dd>{formatMonthDayTime(preview.clockInTime)}</dd></div>
        <div><dt>退勤時刻</dt><dd>{formatMonthDayTime(preview.clockOutTime)}</dd></div>
        <div><dt>丸め後退勤</dt><dd>{formatMonthDayTime(preview.roundedClockOutTime)}</dd></div>
        <div><dt>稼働時間</dt><dd>{preview.workHours}h</dd></div>
        <div><dt>時給</dt><dd>{yen(preview.hourlyWage)}</dd></div>
        <div><dt>時給小計</dt><dd>{yen(preview.wageSubtotal)}</dd></div>
        <div><dt>走行距離</dt><dd>{preview.distance ?? 0}km</dd></div>
        <div><dt>ガス単価</dt><dd>{preview.gasRate ? yen(preview.gasRate) : "-"}</dd></div>
        <div><dt>ガス代小計</dt><dd>{yen(preview.gasSubtotal)}</dd></div>
        <div className="settlement-total"><dt>合計報酬</dt><dd>{yen(preview.totalPayment)}</dd></div>
      </dl>
    </div>
  );
}

function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="driver-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="driver-modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="between modal-head">
          <h2>{title}</h2>
          <button className="button secondary" type="button" onClick={onClose}>閉じる</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function mainActionsFor(status: string, latestRideLog?: any | null) {
  const latestRideType = latestRideLog?.type;
  if (status === "未出勤" || status === "退勤済み") return ["CLOCK_IN"];
  if (status === "出勤中") return ["START_RIDE", "WAIT_OFFICE"];
  if (["送り中", "迎え中", "戻り中", "その他"].includes(status)) return ["ARRIVE"];
  if (status === "現地到着") return (latestRideType === "送り" || latestRideType === "事務所戻り") && latestRideLog?.castName ? ["DROPOFF"] : ["START_RIDE"];
  if (status === "女性降車済み") return ["START_RIDE", "WAIT_FIELD", "WAIT_OFFICE"];
  if (status === "現地待機" || status === "事務所待機") return ["START_RIDE"];
  return [];
}

function statusIcon(status: string) {
  if (status === "送り中") return "🚕";
  if (status === "迎え中") return "🙋";
  if (status === "戻り中") return "🏠";
  if (status === "現地到着") return "✅";
  if (status === "女性降車済み") return "👋";
  if (status === "現地待機") return "📍";
  if (status === "事務所待機") return "🏢";
  if (status === "退勤済み") return "🔴";
  if (status === "出勤中") return "🟢";
  return "⚪";
}

function statusClass(status: string) {
  if (status === "退勤済み") return "status-guide-done";
  if (["送り中", "迎え中", "戻り中", "その他"].includes(status)) return "status-guide-ride";
  if (["現地到着", "女性降車済み"].includes(status)) return "status-guide-arrived";
  if (["現地待機", "事務所待機"].includes(status)) return "status-guide-wait";
  return "status-guide-default";
}

function formatMonthDayTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatBusinessDateWithWeekday(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const yyyy = tokyo.getUTCFullYear();
  const mm = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tokyo.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}（${weekdays[tokyo.getUTCDay()]}）`;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function minutesUntilText(value?: string | null) {
  if (!value) return "未設定";
  const diff = new Date(value).getTime() - Date.now();
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 0) return `${Math.abs(minutes)}分超過`;
  if (minutes === 0) return "まもなく";
  return `${minutes}分`;
}

function scheduledStatusClass(value?: string | null) {
  if (!value) return "scheduled-normal";
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0) return "scheduled-overdue";
  if (diff <= 30 * 60_000) return "scheduled-soon";
  return "scheduled-normal";
}

function scheduledStatusText(value?: string | null) {
  if (!value) return "";
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0) return "超過中";
  if (diff <= 30 * 60_000) return "30分以内";
  return "";
}

function toLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function yen(value?: string | number | null) {
  return `${Number(value ?? 0).toLocaleString()}円`;
}

function LogTable({ logs }: { logs: any[] }) {
  return (
    <div className="table-wrap driver-history-scroll">
      <table className="driver-history-table">
        <thead><tr><th>時刻</th><th>操作</th><th>状態</th><th>種別</th><th>キャスト名</th><th>目的地</th><th>メモ</th></tr></thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.datetime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</td>
              <td>{labels[log.action] ?? log.action}</td>
              <td>{log.status}</td>
              <td>{log.type ?? "-"}</td>
              <td>{log.castName ?? "-"}</td>
              <td>{log.destination ?? "-"}</td>
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
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return {};
  try {
    const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("location timeout")), 3500));
    const position = new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 3000,
        maximumAge: 60_000
      });
    });
    const safePosition = await Promise.race([position, timeout]);
    return {
      latitude: safePosition.coords.latitude,
      longitude: safePosition.coords.longitude,
      accuracy: safePosition.coords.accuracy,
      capturedAt: new Date(safePosition.timestamp).toISOString()
    };
  } catch {
    return {};
  }
}
