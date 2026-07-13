"use client";

import React, { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { buildNotificationDisplay as buildNotificationDisplayView } from "@/lib/notification-view";
import { formatBusinessDate as formatBusinessDateValue, getBusinessDate } from "@/lib/time";

type TabKey = "dashboard" | "waiting" | "rides" | "today" | "history" | "clockOuts" | "clockOutSummary" | "drivers" | "notifications" | "system";
type Dashboard = {
  businessDate: string;
  summary: { workingWaitingCount: number; activeRideCount: number };
  waitingDrivers: any[];
  activeRideDrivers: any[];
  lastUpdatedAt: string;
  drivers: any[];
  todayLogs: any[];
  unreadNotificationCount?: number;
  warningSummary?: NotificationSummary[];
};
type NotificationSummary = { type: string; severity: string; count: number };
type AdminNotification = {
  id: string;
  category: "BUSINESS" | "SYSTEM";
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  relatedLogId?: string | null;
  isRead: boolean;
  createdAt: string;
  driver?: { id: string; driverName: string } | null;
  relatedLog?: {
    id: string;
    driverId: string;
    driverName: string;
    action: string;
    status: string;
    type?: string | null;
    castName?: string | null;
    destination?: string | null;
    estimatedArrival?: string | null;
    actualArrival?: string | null;
    dropoffTime?: string | null;
    clockOutTime?: string | null;
    scheduledClockOut?: string | null;
    oldScheduledClockOut?: string | null;
    newScheduledClockOut?: string | null;
    workHours?: string | number | null;
    totalPayment?: string | number | null;
    dailyReport?: string | null;
    memo?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    datetime?: string | null;
    createdAt?: string | null;
  } | null;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "ダッシュボード" },
  { key: "waiting", label: "出勤・待機中一覧" },
  { key: "rides", label: "送迎中一覧" },
  { key: "today", label: "本日履歴" },
  { key: "history", label: "全履歴" },
  { key: "clockOuts", label: "退勤一覧" },
  { key: "clockOutSummary", label: "退勤者集計" },
  { key: "drivers", label: "ドライバー設定" },
  { key: "notifications", label: "通知履歴" },
  { key: "system", label: "システム設定" }
];

const actionLabels: Record<string, string> = {
  CLOCK_IN: "出勤",
  START_RIDE: "送迎開始",
  RIDE_CANCELLED: "送迎キャンセル",
  ARRIVE: "現地到着",
  DROPOFF: "女性降車",
  WAIT_FIELD: "現地待機",
  WAIT_OFFICE: "事務所待機",
  CLOCK_OUT: "退勤",
  UPDATE_SCHEDULED_CLOCK_OUT: "退勤予定変更",
  MAIL_CONFIRM_SEND: "送りメール確認",
  MAIL_CONFIRM_PICKUP: "迎えメール確認",
  ADMIN_STATUS_CORRECTION: "管理者代理修正",
  ADMIN_CLOCK_IN_CORRECTION: "管理者出勤時刻修正",
  ADMIN_WORK_TIME_CORRECTION: "管理者勤務時間修正",
  ADMIN_PROXY_CLOCK_OUT: "管理者代理退勤"
};

const correctableStatuses = ["出勤中", "送り中", "迎え中", "戻り中", "その他", "現地到着", "女性降車済み", "現地待機", "事務所待機"];
const rideCorrectionStatuses = ["送り中", "迎え中", "戻り中", "その他"];

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(() => initialAdminTab());
  const [menuOpen, setMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [history, setHistory] = useState<{ logs: any[]; totalPages: number; page: number }>({ logs: [], totalPages: 1, page: 1 });
  const [clockOuts, setClockOuts] = useState<any[]>([]);
  const [clockOutSummary, setClockOutSummary] = useState<any | null>(null);
  const [clockOutSummaryFilters, setClockOutSummaryFilters] = useState({ businessDateFrom: todayInputDate(), businessDateTo: todayInputDate(), driverId: "" });
  const [selectedClockOutSummary, setSelectedClockOutSummary] = useState<any | null>(null);
  const [driverSettings, setDriverSettings] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [logDeleteMode, setLogDeleteMode] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [statusCorrectionTarget, setStatusCorrectionTarget] = useState<any | null>(null);
  const [workTimeTarget, setWorkTimeTarget] = useState<any | null>(null);
  const [proxyClockOutTarget, setProxyClockOutTarget] = useState<any | null>(null);
  const [addingDriver, setAddingDriver] = useState(false);
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationFilters, setNotificationFilters] = useState({ unreadOnly: false, type: "", driverId: "" });
  const [notificationCategory, setNotificationCategory] = useState<"BUSINESS" | "SYSTEM">("BUSINESS");
  const [systemUnreadCount, setSystemUnreadCount] = useState(0);
  const [businessUnreadCount, setBusinessUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoReadBusinessOnOpen, setAutoReadBusinessOnOpen] = useState(true);
  const [toasts, setToasts] = useState<AdminNotification[]>([]);
  const [message, setMessage] = useState("");
  const [historyFilters, setHistoryFilters] = useState({ businessDateFrom: "", businessDateTo: "", driverId: "", status: "", type: "", action: "", castName: "", destination: "" });
  const knownNotificationIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    localStorage.setItem("adminActiveTab", activeTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabQueryValue(activeTab));
    window.history.replaceState(null, "", url.toString());
    setSelectedLogIds([]);
    setLogDeleteMode(false);
  }, [activeTab]);

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
    if (response.status === 401) return router.push("/admin/login");
    setDashboard(await response.json());
  }, [router]);

  const loadToday = useCallback(async () => {
    const response = await fetch("/api/admin/logs/today", { cache: "no-store" });
    if (response.ok) setTodayLogs((await response.json()).logs);
  }, []);

  const loadClockOuts = useCallback(async () => {
    const response = await fetch("/api/admin/clock-outs", { cache: "no-store" });
    if (response.ok) setClockOuts((await response.json()).logs);
  }, []);

  const loadClockOutSummary = useCallback(async () => {
    const params = new URLSearchParams(clockOutSummaryFilters);
    const response = await fetch(`/api/admin/clock-out-summary?${params.toString()}`, { cache: "no-store" });
    if (response.ok) setClockOutSummary(await response.json());
  }, [clockOutSummaryFilters]);

  const loadDriverSettings = useCallback(async () => {
    const response = await fetch("/api/admin/drivers/settings", { cache: "no-store" });
    if (response.ok) setDriverSettings((await response.json()).drivers);
  }, []);

  const loadHistory = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    for (const [key, value] of Object.entries(historyFilters)) if (value) params.set(key, value);
    const response = await fetch(`/api/admin/logs?${params.toString()}`, { cache: "no-store" });
    if (response.ok) setHistory(await response.json());
  }, [historyFilters]);

  const loadNotifications = useCallback(async () => {
    const params = new URLSearchParams();
    if (notificationFilters.unreadOnly) params.set("unreadOnly", "true");
    if (notificationFilters.type) params.set("type", notificationFilters.type);
    if (notificationFilters.driverId) params.set("driverId", notificationFilters.driverId);
    const response = await fetch(`/api/admin/notifications?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    const items: AdminNotification[] = result.notifications;
    setNotifications(items);
    setSystemUnreadCount(result.systemUnreadCount ?? result.unreadCount ?? 0);
    setBusinessUnreadCount(result.businessUnreadCount ?? 0);
    const unreadToastIds = new Set(items.filter((item) => shouldToastNotification(item) && !item.isRead).map((item) => item.id));
    if (knownNotificationIds.current) {
      const fresh = items.filter((item) => shouldToastNotification(item) && !item.isRead && !knownNotificationIds.current!.has(item.id));
      if (fresh.length) {
        setToasts((current) => [...fresh, ...current].slice(0, 6));
        if (soundEnabled) playNotificationSound(fresh[0].severity);
        window.setTimeout(() => setToasts((current) => current.filter((item) => !fresh.some((next) => next.id === item.id))), 7000);
      }
    }
    knownNotificationIds.current = unreadToastIds;
  }, [notificationFilters, soundEnabled]);

  const resetHistory = useCallback(async () => {
    setHistoryFilters({ businessDateFrom: "", businessDateTo: "", driverId: "", status: "", type: "", action: "", castName: "", destination: "" });
    const response = await fetch("/api/admin/logs?page=1&limit=50", { cache: "no-store" });
    if (response.ok) setHistory(await response.json());
  }, []);

  useEffect(() => {
    loadDashboard();
    const timer = window.setInterval(loadDashboard, 5_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 5_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (activeTab === "today") loadToday();
    if (activeTab === "history") loadHistory(1);
    if (activeTab === "clockOuts") loadClockOuts();
    if (activeTab === "clockOutSummary") loadClockOutSummary();
    if (activeTab === "drivers") loadDriverSettings();
    if (activeTab === "notifications") loadNotifications();
  }, [activeTab, loadClockOuts, loadClockOutSummary, loadDriverSettings, loadHistory, loadNotifications, loadToday]);

  async function logout() {
    await fetch("/api/auth/admin-logout", { method: "POST" });
    router.push("/admin/login");
  }

  async function openLog(logId: string) {
    const response = await fetch(`/api/admin/logs/${logId}`, { cache: "no-store" });
    if (response.ok) setSelectedLog((await response.json()).log);
  }

  async function saveLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLog) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/logs/${selectedLog.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    setMessage(response.ok ? "履歴を修正しました。" : "履歴修正に失敗しました。");
    setSelectedLog(null);
    await Promise.all([loadDashboard(), loadToday(), loadHistory(history.page), loadClockOuts()]);
  }

  async function saveDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDriver) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/drivers/${selectedDriver.id}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    setMessage(response.ok ? "ドライバー設定を更新しました。" : "ドライバー設定の更新に失敗しました。");
    setSelectedDriver(null);
    await Promise.all([loadDashboard(), loadDriverSettings()]);
  }

  async function addDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/drivers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(form.entries()), isActive: form.get("isActive") === "on" })
    });
    setMessage(response.ok ? "ドライバーを追加しました。" : "ドライバー追加に失敗しました。");
    setAddingDriver(false);
    await Promise.all([loadDashboard(), loadDriverSettings()]);
  }

  async function deleteDriver(driver: any) {
    if (!window.confirm("このドライバーを削除しますか？\n過去の履歴がある場合は削除できない場合があります。")) return;
    const response = await fetch(`/api/admin/drivers/${driver.id}/settings`, { method: "DELETE" });
    setMessage(response.ok ? "ドライバーを削除しました。" : "ドライバー削除に失敗しました。");
    setSelectedDriver(null);
    await Promise.all([loadDashboard(), loadDriverSettings()]);
  }

  async function setDriverActive(driver: any, isActive: boolean) {
    const confirmMessage = isActive
      ? "このドライバーを有効化しますか？"
      : "このドライバーを無効化しますか？\n無効化するとログインできなくなります。\n過去の履歴は削除されません。";
    if (!window.confirm(confirmMessage)) return;
    const response = await fetch(`/api/admin/drivers/${driver.id}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive })
    });
    setMessage(response.ok ? (isActive ? "ドライバーを有効化しました。" : "ドライバーを無効化しました。") : "ドライバー設定の更新に失敗しました。");
    setSelectedDriver(null);
    await Promise.all([loadDashboard(), loadDriverSettings()]);
  }

  function toggleLogSelection(logId: string) {
    setSelectedLogIds((current) => current.includes(logId) ? current.filter((id) => id !== logId) : [...current, logId]);
  }

  async function deleteSelectedLogs() {
    if (!selectedLogIds.length) return;
    if (!window.confirm("選択した履歴を削除しますか？\nこの操作は元に戻せません。")) return;
    const response = await fetch("/api/admin/logs/bulk", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logIds: selectedLogIds })
    });
    setMessage(response.ok ? "選択した履歴を削除しました。" : "履歴削除に失敗しました。");
    setSelectedLogIds([]);
    setLogDeleteMode(false);
    await Promise.all([loadDashboard(), loadToday(), loadHistory(history.page), loadClockOuts(), loadClockOutSummary()]);
  }

  async function toggleNotificationRead(notification: AdminNotification) {
    const response = await fetch(`/api/admin/notifications/${notification.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isRead: !notification.isRead })
    });
    if (response.ok) await loadNotifications();
  }

  async function readAllNotifications(category: "BUSINESS" | "SYSTEM") {
    const response = await fetch("/api/admin/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category })
    });
    if (response.ok) await loadNotifications();
  }

  async function submitStatusCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusCorrectionTarget) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/drivers/${statusCorrectionTarget.driverId}/correct-status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: form.get("status"),
        reason: form.get("reason"),
        rideType: form.get("rideType"),
        castName: form.get("castName"),
        destination: form.get("destination"),
        estimatedArrival: form.get("estimatedArrival"),
        memo: form.get("memo"),
        expectedStatus: statusCorrectionTarget.status,
        expectedUpdatedAt: statusCorrectionTarget.lastUpdatedAt
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(result.error ?? "状態修正に失敗しました。");
      return;
    }
    setMessage("");
    setStatusCorrectionTarget(null);
    await Promise.all([loadDashboard(), loadNotifications()]);
    if (activeTab === "today") await loadToday();
    if (activeTab === "history") await loadHistory(history.page);
  }

  async function submitWorkTimeCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workTimeTarget) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/drivers/${workTimeTarget.driverId}/correct-work-time`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clockOutLogId: workTimeTarget.id,
        clockInAt: form.get("clockInAt"),
        clockOutAt: form.get("clockOutAt"),
        reason: form.get("reason"),
        expectedUpdatedAt: workTimeTarget.lastUpdatedAt ?? workTimeTarget.updatedAt
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(`勤務時間修正に失敗しました。${result.error ? ` ${result.error}` : ""}`);
    setMessage("");
    setWorkTimeTarget(null);
    await Promise.all([loadDashboard(), loadToday(), loadHistory(history.page), loadClockOuts(), loadClockOutSummary()]);
  }

  async function submitProxyClockOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proxyClockOutTarget) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/drivers/${proxyClockOutTarget.driverId}/proxy-clock-out`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clockOutAt: form.get("clockOutAt"),
        gasDistance: form.get("gasDistance"),
        dailyReportMemo: form.get("dailyReportMemo"),
        reason: form.get("reason"),
        expectedStatus: proxyClockOutTarget.status,
        expectedUpdatedAt: proxyClockOutTarget.lastUpdatedAt
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(`代理退勤に失敗しました。${result.error ? ` ${result.error}` : ""}`);
    setMessage("");
    setProxyClockOutTarget(null);
    await Promise.all([loadDashboard(), loadToday(), loadHistory(history.page), loadClockOuts(), loadClockOutSummary(), loadNotifications()]);
  }

  async function toggleNotificationCenter() {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (nextOpen && autoReadBusinessOnOpen) await readAllNotifications("BUSINESS");
  }

  const title = tabs.find((tab) => tab.key === activeTab)?.label ?? "ダッシュボード";

  return (
    <main className="admin-monitor">
      <button className="mobile-menu-button" onClick={() => setMenuOpen(true)}>☰</button>
      <aside className={`monitor-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <div>
            <h1>運行モニター</h1>
            <p>ドライバー業務管理</p>
          </div>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)}>×</button>
        </div>
        <nav className="sidebar-nav">
          {tabs.map((tab) => (
            <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => { setActiveTab(tab.key); setMenuOpen(false); }}>
              {tab.label}
            </button>
          ))}
        </nav>
        <button className="sidebar-logout" onClick={logout}>ログアウト</button>
      </aside>

      <section className="monitor-main">
        <header className="monitor-header">
          <div>
            <p className="muted">管理者画面</p>
            <h2>{title}</h2>
          </div>
          <div className="header-meta">
            <span>営業日 {formatDateWithWeekday(dashboard?.businessDate)}</span>
            <span>最終更新 {formatTime(dashboard?.lastUpdatedAt)}</span>
            <NotificationBell
              notifications={notifications}
              unreadCount={systemUnreadCount || dashboard?.unreadNotificationCount || 0}
              businessUnreadCount={businessUnreadCount}
              systemUnreadCount={systemUnreadCount || dashboard?.unreadNotificationCount || 0}
              open={notificationOpen}
              onToggleOpen={toggleNotificationCenter}
              activeCategory={notificationCategory}
              setActiveCategory={setNotificationCategory}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
              autoReadBusinessOnOpen={autoReadBusinessOnOpen}
              setAutoReadBusinessOnOpen={setAutoReadBusinessOnOpen}
              onReadAll={readAllNotifications}
              onOpenHistory={() => { setActiveTab("notifications"); setNotificationOpen(false); }}
              onToggleRead={toggleNotificationRead}
            />
          </div>
        </header>
        {message && <p className={message.includes("失敗") ? "error" : "success"}>{message}</p>}
        {!dashboard ? <div className="panel">読み込み中...</div> : (
          <>
            {activeTab === "dashboard" && <DashboardView dashboard={dashboard} onCorrectStatus={setStatusCorrectionTarget} onCorrectWorkTime={setWorkTimeTarget} onProxyClockOut={setProxyClockOutTarget} />}
            {activeTab === "waiting" && <WaitingTable rows={dashboard.waitingDrivers} onCorrectStatus={setStatusCorrectionTarget} onCorrectWorkTime={setWorkTimeTarget} onProxyClockOut={setProxyClockOutTarget} />}
            {activeTab === "rides" && <RideTable rows={dashboard.activeRideDrivers} onCorrectStatus={setStatusCorrectionTarget} onCorrectWorkTime={setWorkTimeTarget} onProxyClockOut={setProxyClockOutTarget} />}
            {activeTab === "today" && (
              <LogTable
                logs={todayLogs.length ? todayLogs : dashboard.todayLogs}
                onOpen={openLog}
                selectedIds={selectedLogIds}
                deleteMode={logDeleteMode}
                onStartDeleteMode={() => setLogDeleteMode(true)}
                onEndDeleteMode={() => { setLogDeleteMode(false); setSelectedLogIds([]); }}
                onToggleSelect={toggleLogSelection}
                onDeleteSelected={deleteSelectedLogs}
              />
            )}
            {activeTab === "history" && (
              <HistoryView
                drivers={dashboard.drivers}
                filters={historyFilters}
                setFilters={setHistoryFilters}
                searchOpen={historySearchOpen}
                setSearchOpen={setHistorySearchOpen}
                history={history}
                onSearch={() => loadHistory(1)}
                onReset={resetHistory}
                onPage={loadHistory}
                onOpen={openLog}
                selectedIds={selectedLogIds}
                deleteMode={logDeleteMode}
                onStartDeleteMode={() => setLogDeleteMode(true)}
                onEndDeleteMode={() => { setLogDeleteMode(false); setSelectedLogIds([]); }}
                onToggleSelect={toggleLogSelection}
                onDeleteSelected={deleteSelectedLogs}
              />
            )}
            {activeTab === "clockOuts" && <ClockOutTable logs={clockOuts} onCorrectWorkTime={setWorkTimeTarget} />}
            {activeTab === "clockOutSummary" && (
              <ClockOutSummaryView
                drivers={dashboard.drivers}
                filters={clockOutSummaryFilters}
                setFilters={setClockOutSummaryFilters}
                data={clockOutSummary}
                onSearch={loadClockOutSummary}
                onOpen={setSelectedClockOutSummary}
              />
            )}
            {activeTab === "drivers" && <DriverSettingsTable rows={driverSettings} onOpen={setSelectedDriver} onAdd={() => setAddingDriver(true)} />}
            {activeTab === "notifications" && (
              <NotificationHistory
                notifications={notifications}
                drivers={dashboard.drivers}
                activeCategory={notificationCategory}
                setActiveCategory={setNotificationCategory}
                filters={notificationFilters}
                setFilters={setNotificationFilters}
                businessUnreadCount={businessUnreadCount}
                systemUnreadCount={systemUnreadCount}
                onReadAll={readAllNotifications}
                onToggleRead={toggleNotificationRead}
              />
            )}
            {activeTab === "system" && <SystemSettings soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} />}
          </>
        )}
      </section>

      <ToastStack toasts={toasts} />
      {selectedLog && <LogModal log={selectedLog} onClose={() => setSelectedLog(null)} onSave={saveLog} />}
      {selectedClockOutSummary && <ClockOutSummaryModal item={selectedClockOutSummary} onClose={() => setSelectedClockOutSummary(null)} />}
      {selectedDriver && <DriverModal driver={selectedDriver} onClose={() => setSelectedDriver(null)} onSave={saveDriver} onToggleActive={(isActive) => setDriverActive(selectedDriver, isActive)} onDelete={() => deleteDriver(selectedDriver)} />}
      {addingDriver && <AddDriverModal onClose={() => setAddingDriver(false)} onSave={addDriver} />}
      {statusCorrectionTarget && <StatusCorrectionModal target={statusCorrectionTarget} onClose={() => setStatusCorrectionTarget(null)} onSave={submitStatusCorrection} />}
      {workTimeTarget && <WorkTimeCorrectionModal target={workTimeTarget} onClose={() => setWorkTimeTarget(null)} onSave={submitWorkTimeCorrection} />}
      {proxyClockOutTarget && <ProxyClockOutModal target={proxyClockOutTarget} onClose={() => setProxyClockOutTarget(null)} onSave={submitProxyClockOut} />}
    </main>
  );
}

function DashboardView({ dashboard, onCorrectStatus, onCorrectWorkTime, onProxyClockOut }: { dashboard: Dashboard; onCorrectStatus: (row: any) => void; onCorrectWorkTime: (row: any) => void; onProxyClockOut: (row: any) => void }) {
  return (
    <div className="monitor-stack">
      <div className="summary-grid">
        <Summary label="出勤・待機中" value={dashboard.summary.workingWaitingCount} />
        <Summary label="送迎中" value={dashboard.summary.activeRideCount} />
      </div>
      <div className="dashboard-list-grid">
        <section className="monitor-panel dashboard-waiting"><h3>出勤・待機中一覧</h3><WaitingTable rows={dashboard.waitingDrivers} onCorrectStatus={onCorrectStatus} onCorrectWorkTime={onCorrectWorkTime} onProxyClockOut={onProxyClockOut} /></section>
        <section className="monitor-panel dashboard-rides"><h3>送迎中一覧</h3><RideTable rows={dashboard.activeRideDrivers} onCorrectStatus={onCorrectStatus} onCorrectWorkTime={onCorrectWorkTime} onProxyClockOut={onProxyClockOut} /></section>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="summary-box"><span>{label}</span><strong>{value}</strong></div>;
}

function WaitingTable({ rows, compact = false, onCorrectStatus, onCorrectWorkTime, onProxyClockOut }: { rows: any[]; compact?: boolean; onCorrectStatus?: (row: any) => void; onCorrectWorkTime?: (row: any) => void; onProxyClockOut?: (row: any) => void }) {
  return (
    <Table empty="出勤・待機中のドライバーはいません。" tableClassName="monitor-table waiting-table" wrapperClassName="table-scroll waiting-table-wrapper">
      <thead><tr><th>状態</th><th>ドライバー名</th><th>最終更新</th>{!compact && <th>メモ</th>}{onCorrectStatus && <th>操作</th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.driverId}><td><StatusBadge status={row.status} /></td><td>{row.driverName}</td><td>{formatTime(row.lastUpdatedAt)}</td>{!compact && <td className="memo-cell">{row.memo ?? ""}</td>}{onCorrectStatus && <td><AdminDriverActions row={row} onCorrectStatus={onCorrectStatus} onCorrectWorkTime={onCorrectWorkTime} onProxyClockOut={onProxyClockOut} /></td>}</tr>)}</tbody>
    </Table>
  );
}

function RideTable({ rows, compact = false, onCorrectStatus, onCorrectWorkTime, onProxyClockOut }: { rows: any[]; compact?: boolean; onCorrectStatus?: (row: any) => void; onCorrectWorkTime?: (row: any) => void; onProxyClockOut?: (row: any) => void }) {
  return (
    <Table empty="送迎中ドライバーはいません。">
      <thead><tr><th>状態</th><th>ドライバー名</th><th>到着予定</th><th>キャスト名</th><th>目的地</th><th>実際到着</th><th>送迎状態</th><th>最終更新</th>{!compact && <th>メモ</th>}{onCorrectStatus && <th>操作</th>}</tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.driverId}>
          <td><StatusBadge status={row.status} /></td><td>{row.driverName}</td><td className="time-strong">{formatTime(row.estimatedArrival)}</td><td>{row.castName ?? "-"}</td><td>{row.destination ?? "-"}</td>
          <td>{formatTime(row.actualArrival)}</td><td><RideStateBadge state={row.rideState} /></td><td>{formatTime(row.lastUpdatedAt)}</td>{!compact && <td className="memo-cell">{row.memo ?? ""}</td>}{onCorrectStatus && <td><AdminDriverActions row={row} onCorrectStatus={onCorrectStatus} onCorrectWorkTime={onCorrectWorkTime} onProxyClockOut={onProxyClockOut} /></td>}
        </tr>
      ))}</tbody>
    </Table>
  );
}

function AdminDriverActions({ row, onCorrectStatus, onCorrectWorkTime, onProxyClockOut }: { row: any; onCorrectStatus?: (row: any) => void; onCorrectWorkTime?: (row: any) => void; onProxyClockOut?: (row: any) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = `admin-action-menu-${row.driverId}`;
  const actions = [
    onCorrectStatus ? { label: "現在状態を修正", onClick: () => onCorrectStatus(row) } : null,
    onCorrectWorkTime ? { label: "出勤時刻を修正", onClick: () => onCorrectWorkTime(row) } : null,
    onProxyClockOut ? { label: "代理退勤", onClick: () => onProxyClockOut(row) } : null
  ].filter((item): item is { label: string; onClick: () => void } => Boolean(item));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const buttonRect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth || 220;
    const menuHeight = menuRef.current?.offsetHeight || Math.max(44, actions.length * 44 + 2);
    const gap = 8;
    const margin = 8;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const opensUp = spaceBelow < menuHeight + gap && spaceAbove >= menuHeight + gap;
    const rawTop = opensUp ? buttonRect.top - menuHeight - gap : buttonRect.bottom + gap;
    const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
    const top = Math.min(Math.max(rawTop, margin), maxTop);
    const rawLeft = buttonRect.right - menuWidth;
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
    const left = Math.min(Math.max(rawLeft, margin), maxLeft);
    setPosition({ top, left });
  }, [actions.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("orientationchange", close);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("orientationchange", close);
    };
  }, [open]);

  const toggleMenu = () => {
    setOpen((current) => !current);
  };

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="admin-row-menu-trigger"
        type="button"
        aria-label={`${row.driverName}の操作メニュー`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggleMenu}
      >
        ⋮
      </button>
      {open && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          className="admin-action-menu"
          role="menu"
          style={{ top: position.top, left: position.left }}
        >
          {actions.map((action) => (
            <button key={action.label} className="admin-action-menu-item" type="button" role="menuitem" onClick={() => runAction(action.onClick)}>
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function LogTable({
  logs,
  onOpen,
  fullDate = false,
  selectedIds = [],
  deleteMode = false,
  onStartDeleteMode,
  onEndDeleteMode,
  onToggleSelect,
  onDeleteSelected
}: {
  logs: any[];
  onOpen: (id: string) => void;
  fullDate?: boolean;
  selectedIds?: string[];
  deleteMode?: boolean;
  onStartDeleteMode?: () => void;
  onEndDeleteMode?: () => void;
  onToggleSelect?: (id: string) => void;
  onDeleteSelected?: () => void;
}) {
  return (
    <div className="monitor-stack">
      {onStartDeleteMode && !deleteMode && (
        <div className="bulk-actions">
          <button className="button secondary" type="button" onClick={onStartDeleteMode}>履歴を選択削除</button>
        </div>
      )}
      {deleteMode && (
        <div className="bulk-actions">
          <button className="button secondary" type="button" onClick={onEndDeleteMode}>削除モード終了</button>
          <span>{selectedIds.length}件選択中</span>
          {selectedIds.length > 0 && <button className="button danger" type="button" onClick={onDeleteSelected}>選択した履歴を削除</button>}
        </div>
      )}
      <Table empty="履歴がありません。">
      <thead><tr>{deleteMode && onToggleSelect && <th>選択</th>}<th>時刻</th><th>ドライバー名</th><th>操作</th><th>状態</th><th>種別</th><th>キャスト名</th><th>目的地</th><th>退勤予定</th><th>変更前</th><th>変更後</th><th>到着予定</th><th>実際到着</th><th>降車時刻</th><th>メモ</th><th>Discord送信</th></tr></thead>
      <tbody>{logs.map((log) => (
        <tr key={log.id} className="click-row" onClick={() => onOpen(log.id)}>
          {deleteMode && onToggleSelect && <td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(log.id)} onChange={() => onToggleSelect(log.id)} /></td>}
          <td>{fullDate ? formatDateTime(log.datetime) : formatTime(log.datetime)}</td><td>{log.driverName}</td><td>{actionLabels[log.action] ?? log.action}</td><td>{log.status}</td><td>{log.type ?? "-"}</td><td>{log.castName ?? "-"}</td><td>{log.destination ?? "-"}</td>
          <td>{formatMonthDayTime(log.scheduledClockOut)}</td><td>{formatMonthDayTime(log.oldScheduledClockOut)}</td><td>{formatMonthDayTime(log.newScheduledClockOut)}</td><td className="time-strong">{formatTime(log.estimatedArrival)}</td><td>{formatTime(log.actualArrival)}</td><td>{formatTime(log.dropoffTime)}</td><td className="memo-cell">{log.memo ?? ""}</td><td>{log.discordSent ? "送信済み" : "未送信"}</td>
        </tr>
      ))}</tbody>
      </Table>
    </div>
  );
}

function HistoryView({ drivers, filters, setFilters, searchOpen, setSearchOpen, history, onSearch, onReset, onPage, onOpen, selectedIds, deleteMode, onStartDeleteMode, onEndDeleteMode, onToggleSelect, onDeleteSelected }: any) {
  return (
    <div className="monitor-stack">
      <section className="monitor-panel">
        <button className="button secondary" type="button" onClick={() => setSearchOpen(!searchOpen)}>{searchOpen ? "検索条件を閉じる" : "検索条件を開く"}</button>
        {searchOpen && (
          <form className="search-grid collapsible-search" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
            <label>営業日（開始）<input type="date" value={filters.businessDateFrom} onChange={(e) => setFilters({ ...filters, businessDateFrom: e.target.value })} /></label>
            <label>営業日（終了）<input type="date" value={filters.businessDateTo} onChange={(e) => setFilters({ ...filters, businessDateTo: e.target.value })} /></label>
            <label>ドライバー<select value={filters.driverId} onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}><option value="">全員</option>{drivers.map((d: any) => <option key={d.id} value={d.id}>{d.driverName}</option>)}</select></label>
            <label>状態<input value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} /></label>
            <label>種別<input value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} /></label>
            <label>操作<input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} /></label>
            <label>キャスト名<input value={filters.castName} onChange={(e) => setFilters({ ...filters, castName: e.target.value })} /></label>
            <label>目的地<input value={filters.destination} onChange={(e) => setFilters({ ...filters, destination: e.target.value })} /></label>
            <div className="row"><button className="button" type="submit">検索</button><button className="button secondary" type="button" onClick={onReset}>リセット</button></div>
          </form>
        )}
      </section>
      <LogTable logs={history.logs} onOpen={onOpen} fullDate selectedIds={selectedIds} deleteMode={deleteMode} onStartDeleteMode={onStartDeleteMode} onEndDeleteMode={onEndDeleteMode} onToggleSelect={onToggleSelect} onDeleteSelected={onDeleteSelected} />
      <div className="pager"><button className="button secondary" disabled={history.page <= 1} onClick={() => onPage(history.page - 1)}>前へ</button><span>{history.page} / {history.totalPages || 1}</span><button className="button secondary" disabled={history.page >= history.totalPages} onClick={() => onPage(history.page + 1)}>次へ</button></div>
    </div>
  );
}

function ClockOutTable({ logs, onCorrectWorkTime }: { logs: any[]; onCorrectWorkTime?: (row: any) => void }) {
  return (
    <Table empty="退勤済みログがありません。">
      <thead><tr><th>ドライバー名</th><th>時給</th><th>出勤時間</th><th>退勤時間</th><th>丸め後</th><th>稼働時間</th><th>時給分</th><th>ガス精算</th><th>走行距離</th><th>ガス代</th><th>合計報酬</th><th>業務報告</th><th>最終更新</th>{onCorrectWorkTime && <th>操作</th>}</tr></thead>
      <tbody>{logs.map((log) => <tr key={log.id}><td>{log.driverName}</td><td>{money(log.hourlyWage)}</td><td>{formatTime(log.clockInTime)}</td><td>{formatTime(log.clockOutTime)}</td><td>{formatTime(log.roundedClockOutTime)}</td><td>{log.workHours ?? "-"}h</td><td>{money(log.wageSubtotal)}</td><td>{formatGasSettlement(log.gasSettlementType)}</td><td>{log.distance ?? "-"}km</td><td>{money(log.gasSubtotal)}</td><td>{money(log.totalPayment)}</td><td className="memo-cell">{log.dailyReport ?? ""}</td><td>{formatTime(log.updatedAt)}</td>{onCorrectWorkTime && <td><button className="button secondary admin-status-correct-button" type="button" onClick={() => onCorrectWorkTime(log)}>勤務時間を修正</button></td>}</tr>)}</tbody>
    </Table>
  );
}

function ClockOutSummaryView({ drivers, filters, setFilters, data, onSearch, onOpen }: any) {
  const csvUrl = `/api/admin/clock-out-summary/csv?${new URLSearchParams(filters).toString()}`;
  return (
    <div className="monitor-stack">
      <section className="monitor-panel">
        <form className="search-grid clock-summary-filter-grid" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
          <label>営業日From<input type="date" required value={filters.businessDateFrom} onChange={(event) => setFilters({ ...filters, businessDateFrom: event.target.value })} /></label>
          <label>営業日To<input type="date" required value={filters.businessDateTo} onChange={(event) => setFilters({ ...filters, businessDateTo: event.target.value })} /></label>
          <label>ドライバー<select value={filters.driverId} onChange={(event) => setFilters({ ...filters, driverId: event.target.value })}><option value="">全員</option>{drivers.map((driver: any) => <option key={driver.id} value={driver.id}>{driver.driverName}</option>)}</select></label>
          <div className="row clock-summary-actions"><button className="button" type="submit">検索</button><a className="button secondary csv-link" href={csvUrl}>CSV出力</a></div>
        </form>
      </section>
      {!data ? <div className="panel">読み込み中...</div> : (
        <>
          <div className="summary-grid clock-summary-grid">
            <Summary label="退勤人数" value={data.summary.clockOutCount} />
            <Summary label="合計稼働時間" value={`${formatHours(data.summary.totalWorkHours)}h` as any} />
            <Summary label="合計走行距離" value={`${formatDistance(data.summary.totalDistance)}km` as any} />
            <Summary label="合計ガス代" value={money(data.summary.totalGasSubtotal) as any} />
            <Summary label="合計時給分" value={money(data.summary.totalWageSubtotal) as any} />
            <Summary label="合計報酬" value={money(data.summary.totalPayment) as any} />
          </div>
          <section className="monitor-panel stack">
            <h3>ドライバー別集計</h3>
            <Table empty="集計対象がありません。">
              <thead><tr><th>ドライバー名</th><th>退勤回数</th><th>合計稼働時間</th><th>合計走行距離</th><th>合計ガス代</th><th>合計時給分</th><th>合計報酬</th></tr></thead>
              <tbody>{data.byDriver.map((row: any) => <tr key={row.driverId}><td>{row.driverName}</td><td>{row.clockOutCount}</td><td>{formatHours(row.totalWorkHours)}h</td><td>{formatDistance(row.totalDistance)}km</td><td>{money(row.totalGasSubtotal)}</td><td>{money(row.totalWageSubtotal)}</td><td>{money(row.totalPayment)}</td></tr>)}</tbody>
            </Table>
          </section>
          <section className="monitor-panel stack">
            <h3>退勤者一覧</h3>
            <Table empty="退勤者がいません。" tableClassName="monitor-table clock-out-summary-table">
              <thead><tr><th>営業日</th><th>ドライバー名</th><th>出勤時刻</th><th>退勤時刻</th><th>丸め後退勤</th><th>稼働時間</th><th>時給</th><th>時給小計</th><th>走行距離</th><th>ガス単価</th><th>ガス代小計</th><th>合計報酬</th><th>業務報告</th><th>退勤登録時刻</th></tr></thead>
              <tbody>{data.items.map((item: any) => (
                <tr key={item.id} className="click-row" onClick={() => onOpen(item)}>
                  <td>{formatDateWithWeekday(item.businessDate)}</td><td>{item.driverName}</td><td>{formatMonthDayTime(item.clockInTime)}</td><td>{formatMonthDayTime(item.clockOutTime)}</td><td>{formatMonthDayTime(item.roundedClockOutTime)}</td>
                  <td>{formatHours(item.workHours)}h</td><td>{money(item.hourlyWage)}</td><td>{money(item.wageSubtotal)}</td><td>{formatDistance(item.distance)}km</td><td>{money(item.gasRate)}</td><td>{money(item.gasSubtotal)}</td><td>{money(item.totalPayment)}</td><td className="memo-cell">{truncate(item.dailyReport, 50)}</td><td>{formatMonthDayTime(item.createdAt)}</td>
                </tr>
              ))}</tbody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}

function ClockOutSummaryModal({ item, onClose }: { item: any; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-panel stack">
        <div className="between"><h3>退勤者詳細</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <p><strong>営業日</strong><br />{formatDateWithWeekday(item.businessDate)}</p>
          <p><strong>ドライバー名</strong><br />{item.driverName}</p>
          <p><strong>出勤時刻</strong><br />{formatMonthDayTime(item.clockInTime)}</p>
          <p><strong>退勤時刻</strong><br />{formatMonthDayTime(item.clockOutTime)}</p>
          <p><strong>丸め後退勤</strong><br />{formatMonthDayTime(item.roundedClockOutTime)}</p>
          <p><strong>稼働時間</strong><br />{formatHours(item.workHours)}h</p>
          <p><strong>時給</strong><br />{money(item.hourlyWage)}</p>
          <p><strong>時給小計</strong><br />{money(item.wageSubtotal)}</p>
          <p><strong>走行距離</strong><br />{formatDistance(item.distance)}km</p>
          <p><strong>ガス単価</strong><br />{money(item.gasRate)}</p>
          <p><strong>ガス代小計</strong><br />{money(item.gasSubtotal)}</p>
          <p><strong>合計報酬</strong><br />{money(item.totalPayment)}</p>
          <p><strong>退勤登録時刻</strong><br />{formatMonthDayTime(item.createdAt)}</p>
        </div>
        <section className="location-box">
          <h3>業務報告</h3>
          <p className="daily-report-full">{item.dailyReport || "-"}</p>
        </section>
        {item.latitude && item.longitude && <a className="button map-link" href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`} target="_blank" rel="noreferrer">Google Mapで開く</a>}
      </section>
    </div>
  );
}

function DriverSettingsTable({ rows, onOpen, onAdd }: { rows: any[]; onOpen: (driver: any) => void; onAdd: () => void }) {
  return (
    <div className="monitor-stack">
      <div className="between compact-actions"><h3>ドライバー設定一覧</h3><button className="button" onClick={onAdd}>追加</button></div>
      <Table empty="ドライバーがいません。">
        <thead><tr><th>ドライバー名</th><th>有効/無効</th><th>時給</th><th>ガス精算タイプ</th><th>ガス単価</th><th>表示順</th><th>最終出勤日</th><th>最終更新</th></tr></thead>
        <tbody>{rows.map((driver) => <tr key={driver.id} className="click-row" onClick={() => onOpen(driver)}><td>{driver.driverName}</td><td>{driver.isActive ? "有効" : "無効"}</td><td>{money(driver.hourlyWage)}</td><td>{formatGasSettlement(driver.gasSettlementType)}</td><td>{money(driver.gasRate)}</td><td>{driver.displayOrder}</td><td>{formatDate(driver.lastClockInAt)}</td><td>{formatTime(driver.updatedAt)}</td></tr>)}</tbody>
      </Table>
    </div>
  );
}

function NotificationHistory({ notifications, drivers, activeCategory, setActiveCategory, filters, setFilters, businessUnreadCount, systemUnreadCount, onReadAll, onToggleRead }: any) {
  const visibleNotifications = notifications.filter((item: AdminNotification) => item.category === activeCategory);
  return (
    <div className="monitor-stack">
      <section className="monitor-panel notification-history-tools">
        <div className="notification-toolbar">
          <NotificationCategoryTabs activeCategory={activeCategory} setActiveCategory={setActiveCategory} businessUnreadCount={businessUnreadCount} systemUnreadCount={systemUnreadCount} />
          <div className="notification-actions">
            <button className="button secondary" type="button" onClick={() => onReadAll("BUSINESS")}>✓ 業務通知を全て既読</button>
            <button className="button secondary" type="button" onClick={() => onReadAll("SYSTEM")}>✓ システム通知を全て既読</button>
          </div>
        </div>
        <div className="notification-filter-grid">
          <label className="check-row"><input type="checkbox" checked={filters.unreadOnly} onChange={(e) => setFilters({ ...filters, unreadOnly: e.target.checked })} />未読のみ</label>
          <label>種別<select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">すべて</option>{notificationTypeOptions(activeCategory).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>ドライバー<select value={filters.driverId} onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}><option value="">全員</option>{drivers.map((driver: any) => <option key={driver.id} value={driver.id}>{driver.driverName}</option>)}</select></label>
        </div>
      </section>
      <div className="notification-card-list">
        {visibleNotifications.map((item: AdminNotification) => (
          <NotificationCard key={item.id} notification={item} />
        ))}
        {!visibleNotifications.length && <p className="empty-state">通知はありません。</p>}
      </div>
    </div>
  );
}

function SystemSettings({ soundEnabled, setSoundEnabled }: { soundEnabled: boolean; setSoundEnabled: (value: boolean) => void }) {
  return (
    <section className="monitor-panel stack">
      <h3>システム設定</h3>
      <label className="check-row"><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />通知音を有効にする</label>
      <p className="muted">PWA、通知センター、Discord補助通知に対応しています。</p>
    </section>
  );
}

function LogModal({ log, onClose, onSave }: { log: any; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between"><h3>履歴詳細・修正</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <label>状態<input name="status" defaultValue={log.status ?? ""} /></label><label>種別<input name="type" defaultValue={log.type ?? ""} /></label><label>キャスト名<input name="castName" defaultValue={log.castName ?? ""} /></label><label>目的地<input name="destination" defaultValue={log.destination ?? ""} /></label>
          <label>到着予定<input name="estimatedArrival" type="datetime-local" defaultValue={toLocalInput(log.estimatedArrival)} /></label><label>実際到着<input name="actualArrival" type="datetime-local" defaultValue={toLocalInput(log.actualArrival)} /></label><label>降車時刻<input name="dropoffTime" type="datetime-local" defaultValue={toLocalInput(log.dropoffTime)} /></label><label>走行距離<input name="distance" type="number" step="0.01" defaultValue={log.distance ?? ""} /></label>
          <label>ガス代<input name="gasSubtotal" type="number" defaultValue={log.gasSubtotal ?? ""} /></label><label>合計報酬<input name="totalPayment" type="number" defaultValue={log.totalPayment ?? ""} /></label>
        </div>
        {log.latitude && log.longitude && (
          <section className="location-box">
            <h3>位置情報</h3>
            <div className="detail-grid">
              <p><strong>緯度</strong><br />{String(log.latitude)}</p>
              <p><strong>経度</strong><br />{String(log.longitude)}</p>
              <p><strong>精度</strong><br />{log.accuracy ? `${log.accuracy}m` : "-"}</p>
              <p><strong>取得時刻</strong><br />{formatDateTime(log.locationCapturedAt)}</p>
            </div>
            <a className="button map-link" href={`https://maps.google.com/?q=${log.latitude},${log.longitude}`} target="_blank" rel="noreferrer">Google Mapで開く</a>
          </section>
        )}
        <label>メモ<textarea name="memo" defaultValue={log.memo ?? ""} /></label><label>業務報告<textarea name="dailyReport" defaultValue={log.dailyReport ?? ""} /></label><label>修正理由<textarea name="reason" /></label>
        <button className="button" type="submit">上書き保存</button>
      </form>
    </div>
  );
}

function DriverModal({ driver, onClose, onSave, onToggleActive, onDelete }: { driver: any; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onToggleActive: (isActive: boolean) => void; onDelete: () => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between"><h3>ドライバー設定編集</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <label>ドライバー名<input name="driverName" defaultValue={driver.driverName} required /></label><label>時給<input name="hourlyWage" type="number" defaultValue={driver.hourlyWage} /></label><label>ガス精算タイプ<select name="gasSettlementType" defaultValue={driver.gasSettlementType}><option value="INCLUDED">ガス代込み</option><option value="SEPARATE">ガス別精算</option></select></label>
          <label>ガス単価<input name="gasRate" type="number" step="0.01" defaultValue={driver.gasRate ?? ""} /></label><label>表示順<input name="displayOrder" type="number" defaultValue={driver.displayOrder} /></label><p><strong>状態</strong><br />{driver.isActive ? "有効" : "無効"}</p>
        </div>
        <div className="between compact-actions">
          <div className="row">
            {driver.isActive ? <button className="button warn" type="button" onClick={() => onToggleActive(false)}>無効化</button> : <button className="button" type="button" onClick={() => onToggleActive(true)}>有効化</button>}
            <button className="button danger" type="button" onClick={onDelete}>削除</button>
          </div>
          <button className="button" type="submit">保存</button>
        </div>
      </form>
    </div>
  );
}

function AddDriverModal({ onClose, onSave }: { onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between"><h3>ドライバー追加</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <label>ドライバー名<input name="driverName" required /></label>
          <label>初期PIN<input name="pin" required /></label>
          <label>時給<input name="hourlyWage" type="number" defaultValue={1200} /></label>
          <label>ガス精算タイプ<select name="gasSettlementType" defaultValue="INCLUDED"><option value="INCLUDED">ガス代込み</option><option value="SEPARATE">ガス別精算</option></select></label>
          <label>ガス単価<input name="gasRate" type="number" step="0.01" /></label>
          <label>表示順<input name="displayOrder" type="number" defaultValue={0} /></label>
          <label className="check-row"><input name="isActive" type="checkbox" defaultChecked />有効</label>
        </div>
        <button className="button" type="submit">追加</button>
      </form>
    </div>
  );
}

function StatusCorrectionModal({ target, onClose, onSave }: { target: any; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const [status, setStatus] = useState("");
  const [rideType, setRideType] = useState(defaultRideType(target));
  const [destination, setDestination] = useState(target.destination ?? "");
  const [castName, setCastName] = useState(target.castName ?? "");
  const [estimatedArrival, setEstimatedArrival] = useState(toLocalInput(target.estimatedArrival));
  const [memo, setMemo] = useState(target.memo ?? "");
  const [reason, setReason] = useState("操作忘れ");
  const showCastName = ["送り中", "迎え中", "戻り中", "女性降車済み"].includes(status);
  const showDestination = ["送り中", "迎え中", "戻り中", "その他", "現地到着", "女性降車済み", "現地待機"].includes(status);
  const showEstimatedArrival = ["送り中", "迎え中", "戻り中"].includes(status);
  const showMemo = status === "その他";
  const castNameRequired = ["送り中", "迎え中", "女性降車済み"].includes(status);
  const destinationRequired = ["送り中", "迎え中", "現地到着", "現地待機"].includes(status);
  const estimatedArrivalRequired = ["送り中", "迎え中"].includes(status);

  useEffect(() => {
    setStatus("");
    setRideType(defaultRideType(target));
    setDestination(target.destination ?? "");
    setCastName(target.castName ?? "");
    setEstimatedArrival(toLocalInput(target.estimatedArrival));
    setMemo(target.memo ?? "");
    setReason("操作忘れ");
  }, [target]);

  useEffect(() => {
    if (status === "戻り中") {
      setRideType("事務所戻り");
      setDestination("事務所");
    } else if (status === "送り中") {
      setRideType("送り");
    } else if (status === "迎え中") {
      setRideType("迎え");
    } else if (status === "その他") {
      setRideType("その他");
    }
  }, [status]);

  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between">
          <h3>現在状態を修正</h3>
          <button type="button" className="button secondary" onClick={onClose}>閉じる</button>
        </div>
        <div className="detail-grid">
          <p><strong>ドライバー名</strong><br />{target.driverName}</p>
          <p><strong>現在状態</strong><br /><StatusBadge status={target.status} /></p>
          <label>修正後ステータス<select name="status" value={status} onChange={(event) => setStatus(event.target.value)} required>
            <option value="">選択してください</option>
            {correctableStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <label>修正理由 <span className="muted">必須</span><textarea name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></label>
        </div>
        {status && (showCastName || showDestination || showEstimatedArrival || showMemo) && (
          <section className="location-box stack">
            <h3>補足情報</h3>
            {rideCorrectionStatuses.includes(status) && <input type="hidden" name="rideType" value={rideType} />}
            <div className="detail-grid">
              {showCastName && <label>キャスト名 {castNameRequired && <span className="muted">必須</span>}<input name="castName" value={castName} onChange={(event) => setCastName(event.target.value)} required={castNameRequired} /></label>}
              {showDestination && <label>目的地 {destinationRequired && <span className="muted">必須</span>}<input name="destination" value={status === "戻り中" ? "事務所" : destination} onChange={(event) => setDestination(event.target.value)} required={destinationRequired} readOnly={status === "戻り中"} /></label>}
              {showEstimatedArrival && <label>到着予定 {estimatedArrivalRequired && <span className="muted">必須</span>}<input name="estimatedArrival" type="datetime-local" value={estimatedArrival} onChange={(event) => setEstimatedArrival(event.target.value)} required={estimatedArrivalRequired} /></label>}
            </div>
            {showMemo && <label>メモ <span className="muted">必須</span><textarea name="memo" value={memo} onChange={(event) => setMemo(event.target.value)} required /></label>}
            <p className="muted">未入力の任意項目は現在の送迎情報を引き継ぎます。必須項目はAPI側でも検証します。</p>
          </section>
        )}
        <p className="muted">保存時に管理者代理修正ログ、監査ログ、システム通知、Discord通知キューを作成します。過去ログは変更しません。</p>
        <button className="button" type="submit">状態を修正</button>
      </form>
    </div>
  );
}

function WorkTimeCorrectionModal({ target, onClose, onSave }: { target: any; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const hasClockOut = Boolean(target.clockOutTime);
  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between"><h3>{hasClockOut ? "勤務時間を修正" : "出勤時刻を修正"}</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <p><strong>対象ドライバー</strong><br />{target.driverName}</p>
          <p><strong>現在の出勤日時</strong><br />{formatMonthDayTime(target.clockInTime)}</p>
          {hasClockOut && <p><strong>現在の退勤日時</strong><br />{formatMonthDayTime(target.clockOutTime)}</p>}
          <label>修正後の出勤日時 <span className="muted">必須</span><input name="clockInAt" type="datetime-local" defaultValue={toLocalInput(target.clockInTime)} required /></label>
          {hasClockOut && <label>修正後の退勤日時 <span className="muted">必須</span><input name="clockOutAt" type="datetime-local" defaultValue={toLocalInput(target.clockOutTime)} required /></label>}
          <label>修正理由 <span className="muted">必須</span><textarea name="reason" defaultValue={hasClockOut ? "操作忘れ" : "出勤操作忘れ"} maxLength={500} required /></label>
        </div>
        <button className="button" type="submit">修正する</button>
      </form>
    </div>
  );
}

function ProxyClockOutModal({ target, onClose, onSave }: { target: any; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between"><h3>代理退勤</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <p><strong>対象ドライバー</strong><br />{target.driverName}</p>
          <p><strong>出勤日時</strong><br />{formatMonthDayTime(target.clockInTime)}</p>
          <label>退勤日時 <span className="muted">必須</span><input name="clockOutAt" type="datetime-local" defaultValue={toLocalInput(new Date().toISOString())} required /></label>
          <label>走行距離 km <span className="muted">必須</span><input name="gasDistance" type="number" min="0" step="0.1" required /></label>
          <label>日報メモ <span className="muted">必須</span><textarea name="dailyReportMemo" defaultValue="管理者代理退勤" required /></label>
          <label>代理退勤理由 <span className="muted">必須</span><textarea name="reason" defaultValue="退勤操作忘れ" maxLength={500} required /></label>
        </div>
        <button className="button danger" type="submit">代理退勤する</button>
      </form>
    </div>
  );
}

function Table({ children, empty, tableClassName = "monitor-table", wrapperClassName = "table-scroll" }: { children: React.ReactNode; empty: string; tableClassName?: string; wrapperClassName?: string }) {
  const childArray = React.Children.toArray(children);
  const rowCount = React.Children.count((childArray[1] as any)?.props?.children);
  const isEmpty = rowCount === 0;
  return <div className={wrapperClassName}><table className={tableClassName}>{children}</table>{isEmpty && <p className="empty-state">{empty}</p>}</div>;
}

function NotificationBell({ notifications, unreadCount, businessUnreadCount, systemUnreadCount, open, onToggleOpen, activeCategory, setActiveCategory, soundEnabled, setSoundEnabled, autoReadBusinessOnOpen, setAutoReadBusinessOnOpen, onReadAll, onOpenHistory, onToggleRead }: any) {
  const visibleNotifications = notifications.filter((item: AdminNotification) => item.category === activeCategory).slice(0, 8);
  return (
    <div className="notification-shell">
      <button className="notification-button" type="button" onClick={onToggleOpen} aria-label="通知">
        <span>🔔</span><strong>{unreadCount}</strong>
      </button>
      {open && (
        <div className="notification-popover">
          <div className="between"><h3>通知センター</h3><label className="check-row"><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />音</label></div>
          <NotificationCategoryTabs activeCategory={activeCategory} setActiveCategory={setActiveCategory} businessUnreadCount={businessUnreadCount} systemUnreadCount={systemUnreadCount} />
          <div className="notification-actions">
            <button className="button secondary" type="button" onClick={() => onReadAll("BUSINESS")}>✓ 業務通知を全て既読</button>
            <button className="button secondary" type="button" onClick={() => onReadAll("SYSTEM")}>✓ システム通知を全て既読</button>
          </div>
          <label className="check-row notification-auto-read"><input type="checkbox" checked={autoReadBusinessOnOpen} onChange={(event) => setAutoReadBusinessOnOpen(event.target.checked)} />開いた時に業務通知を自動既読</label>
          <div className="notification-list">
            {visibleNotifications.map((item: AdminNotification) => (
              <NotificationCard key={item.id} notification={item} compact />
            ))}
            {!visibleNotifications.length && <p className="empty-state">通知はありません。</p>}
          </div>
          <button className="button secondary" type="button" onClick={onOpenHistory}>通知履歴を開く</button>
        </div>
      )}
    </div>
  );
}

function NotificationCategoryTabs({ activeCategory, setActiveCategory, businessUnreadCount, systemUnreadCount }: any) {
  return (
    <div className="notification-tabs">
      <button className={activeCategory === "BUSINESS" ? "active" : ""} type="button" onClick={() => setActiveCategory("BUSINESS")}>業務通知 {businessUnreadCount}</button>
      <button className={activeCategory === "SYSTEM" ? "active" : ""} type="button" onClick={() => setActiveCategory("SYSTEM")}>システム通知 {systemUnreadCount}</button>
    </div>
  );
}

function WarningArea({ summary, onClick }: { summary: NotificationSummary[]; onClick: () => void }) {
  const visible = summary.filter((item) => item.count > 0);
  if (!visible.length) return null;
  return (
    <button className="warning-area" type="button" onClick={onClick}>
      {visible.map((item) => (
        <span key={`${item.type}-${item.severity}`}>{item.severity === "CRITICAL" ? "🚨" : "⚠️"} {notificationTypeLabel(item.type)} {item.count}件</span>
      ))}
    </button>
  );
}

function ToastStack({ toasts }: { toasts: AdminNotification[] }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <NotificationCard key={toast.id} notification={toast} compact className={`toast toast-${toast.severity.toLowerCase()}`} />
      ))}
    </div>
  );
}

function NotificationCard({ notification, compact = false, className = "" }: { notification: AdminNotification; compact?: boolean; className?: string }) {
  const view = buildNotificationDisplayView(notification);
  return (
    <article className={`notification-card notification-line-${view.color} ${notification.isRead ? "read" : ""} ${compact ? "compact" : ""} ${className}`.trim()}>
      <div className="notification-header">
        <strong className="notification-title">{view.icon} {view.title}</strong>
        <span className="notification-time">{view.time}</span>
      </div>
      <div className="notification-driver">{view.driverName}</div>
      {!!view.descriptionLines.length && (
        <div className="notification-details">
          {view.descriptionLines.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
      {view.mapUrl && <a className="notification-map-link" href={view.mapUrl} target="_blank" rel="noreferrer">📍 Google Mapで開く</a>}
    </article>
  );
}

function initialAdminTab(): TabKey {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") ?? localStorage.getItem("adminActiveTab");
  return normalizeTabKey(tab) ?? "dashboard";
}

function normalizeTabKey(value: string | null): TabKey | null {
  if (isTabKey(value)) return value;
  const aliases: Record<string, TabKey> = {
    "today-logs": "today",
    "all-logs": "history",
    "clock-outs": "clockOuts",
    "clock-out-summary": "clockOutSummary",
    settings: "system"
  };
  return value ? aliases[value] ?? null : null;
}

function tabQueryValue(tab: TabKey) {
  const values: Record<TabKey, string> = {
    dashboard: "dashboard",
    waiting: "waiting",
    rides: "rides",
    today: "today-logs",
    history: "all-logs",
    clockOuts: "clock-outs",
    clockOutSummary: "clock-out-summary",
    drivers: "drivers",
    notifications: "notifications",
    system: "settings"
  };
  return values[tab];
}

function isTabKey(value: string | null): value is TabKey {
  return tabs.some((tab) => tab.key === value);
}

function shouldToastNotification(notification: AdminNotification) {
  return notification.category === "BUSINESS";
}

function formatClockOnly(value?: string | null) {
  if (!value) return "未設定";
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function SeverityBadge({ severity }: { severity: string }) {
  const label = severity === "CRITICAL" ? "緊急" : severity === "WARNING" ? "注意" : "通常";
  return <span className={`severity-badge severity-${severity.toLowerCase()}`}>{label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${statusBadgeClass(status)}`}>{status}</span>;
}

function RideStateBadge({ state }: { state: string }) {
  return <span className={`ride-state ${state === "遅延" ? "delay" : state === "早着" ? "early" : state === "到着済み" ? "arrived" : "normal"}`}>{state}</span>;
}

function statusBadgeClass(status: string) {
  if (status === "未出勤") return "status-not-working";
  if (status === "出勤中") return "status-working";
  if (status === "事務所待機") return "status-wait-office";
  if (status === "現地待機") return "status-wait-field";
  if (status === "送り中") return "status-sending";
  if (status === "迎え中") return "status-picking-up";
  if (status === "戻り中") return "status-returning";
  if (status === "その他") return "status-other";
  if (status === "現地到着") return "status-arrived";
  if (status === "女性降車済み") return "status-dropped-off";
  if (status === "退勤済み") return "status-clocked-out";
  return "status-unknown";
}

function notificationTypeLabel(type: string) {
  if (type === "BUSINESS_ACTION") return "業務通知";
  if (type === "CLOCK_IN") return "出勤";
  if (type === "SCHEDULED_CLOCK_OUT_UPDATED") return "退勤予定変更";
  if (type === "RIDE_CANCELLED") return "送迎キャンセル";
  if (type === "ARRIVAL_OVERDUE") return "到着予定超過";
  if (type === "CLOCK_OUT_OVERDUE") return "退勤予定超過";
  if (type === "CLOCKOUT_60_MIN_BEFORE") return "退勤予定1時間前";
  if (type === "CLOCKOUT_30_MIN_BEFORE") return "退勤予定30分前";
  if (type === "CLOCKOUT_15_MIN_BEFORE") return "退勤予定15分前";
  if (type === "CLOCKOUT_OVER") return "退勤予定超過";
  if (type === "DISCORD_FAILED") return "Discord送信失敗";
  if (type === "SYSTEM_ERROR") return "システムエラー";
  if (type === "ADMIN_STATUS_CORRECTION") return "管理者代理修正";
  if (type === "ADMIN_CLOCK_IN_CORRECTION") return "管理者出勤時刻修正";
  if (type === "ADMIN_WORK_TIME_CORRECTION") return "管理者勤務時間修正";
  if (type === "ADMIN_PROXY_CLOCK_OUT") return "管理者代理退勤";
  return type;
}

function notificationCategoryLabel(category: string) {
  return category === "BUSINESS" ? "業務" : "システム";
}

function notificationTypeOptions(category: "BUSINESS" | "SYSTEM") {
  if (category === "BUSINESS") return [{ value: "BUSINESS_ACTION", label: "業務通知" }, { value: "CLOCK_IN", label: "出勤" }, { value: "RIDE_CANCELLED", label: "送迎キャンセル" }, { value: "SCHEDULED_CLOCK_OUT_UPDATED", label: "退勤予定変更" }];
  return [
    { value: "ARRIVAL_OVERDUE", label: "到着予定超過" },
    { value: "CLOCK_OUT_OVERDUE", label: "退勤予定超過" },
    { value: "CLOCKOUT_60_MIN_BEFORE", label: "退勤予定1時間前" },
    { value: "CLOCKOUT_30_MIN_BEFORE", label: "退勤予定30分前" },
    { value: "CLOCKOUT_15_MIN_BEFORE", label: "退勤予定15分前" },
    { value: "CLOCKOUT_OVER", label: "退勤予定超過" },
    { value: "DISCORD_FAILED", label: "Discord送信失敗" },
    { value: "SYSTEM_ERROR", label: "システムエラー" },
    { value: "ADMIN_STATUS_CORRECTION", label: "管理者代理修正" },
    { value: "ADMIN_CLOCK_IN_CORRECTION", label: "管理者出勤時刻修正" },
    { value: "ADMIN_WORK_TIME_CORRECTION", label: "管理者勤務時間修正" },
    { value: "ADMIN_PROXY_CLOCK_OUT", label: "管理者代理退勤" }
  ];
}

function defaultRideType(target: any) {
  if (target.type) return target.type;
  if (target.status === "送り中") return "送り";
  if (target.status === "迎え中") return "迎え";
  if (target.status === "戻り中") return "事務所戻り";
  return "その他";
}

function playNotificationSound(severity: string) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = severity === "CRITICAL" ? 880 : severity === "WARNING" ? 660 : 440;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (severity === "CRITICAL" ? 0.45 : 0.22));
  } catch {
    // Browser autoplay policies can block sound until the first user gesture.
  }
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatMonthDayTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDateWithWeekday(value?: string | null) {
  if (!value) return "-";
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const yyyy = tokyo.getUTCFullYear();
  const mm = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tokyo.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}（${weekdays[tokyo.getUTCDay()]}）`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

function money(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number(value).toLocaleString()}円`;
}

function formatHours(value?: string | number | null) {
  return Number(value ?? 0).toFixed(1);
}

function formatDistance(value?: string | number | null) {
  return Number(value ?? 0).toFixed(1);
}

function truncate(value?: string | null, max = 50) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function todayInputDate() {
  return formatBusinessDateValue(getBusinessDate());
}

function formatGasSettlement(value?: string | null) {
  if (value === "INCLUDED") return "ガス代込み";
  if (value === "SEPARATE") return "ガス別精算";
  return value ?? "-";
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
