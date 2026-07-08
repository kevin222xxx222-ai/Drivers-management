"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type TabKey = "dashboard" | "waiting" | "rides" | "today" | "history" | "clockOuts" | "drivers" | "notifications" | "system";
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
  isRead: boolean;
  createdAt: string;
  driver?: { id: string; driverName: string } | null;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "ダッシュボード" },
  { key: "waiting", label: "出勤・待機中一覧" },
  { key: "rides", label: "送迎中一覧" },
  { key: "today", label: "本日履歴" },
  { key: "history", label: "全履歴" },
  { key: "clockOuts", label: "退勤一覧" },
  { key: "drivers", label: "ドライバー設定" },
  { key: "notifications", label: "通知履歴" },
  { key: "system", label: "システム設定" }
];

const actionLabels: Record<string, string> = {
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

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [history, setHistory] = useState<{ logs: any[]; totalPages: number; page: number }>({ logs: [], totalPages: 1, page: 1 });
  const [clockOuts, setClockOuts] = useState<any[]>([]);
  const [driverSettings, setDriverSettings] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
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
    const unreadBusinessIds = new Set(items.filter((item) => item.category === "BUSINESS" && !item.isRead).map((item) => item.id));
    if (knownNotificationIds.current) {
      const fresh = items.filter((item) => item.category === "BUSINESS" && !item.isRead && !knownNotificationIds.current!.has(item.id));
      if (fresh.length) {
        setToasts((current) => [...fresh, ...current].slice(0, 6));
        if (soundEnabled) playNotificationSound(fresh[0].severity);
        window.setTimeout(() => setToasts((current) => current.filter((item) => !fresh.some((next) => next.id === item.id))), 7000);
      }
    }
    knownNotificationIds.current = unreadBusinessIds;
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
    if (activeTab === "drivers") loadDriverSettings();
    if (activeTab === "notifications") loadNotifications();
  }, [activeTab, loadClockOuts, loadDriverSettings, loadHistory, loadNotifications, loadToday]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
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
      body: JSON.stringify({ ...Object.fromEntries(form.entries()), isActive: form.get("isActive") === "on" })
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
    if (!window.confirm(`このドライバーを無効化しますか？\n過去の履歴は削除されません。\n無効化すると、このドライバーはログインできなくなります。`)) return;
    const response = await fetch(`/api/admin/drivers/${driver.id}/settings`, { method: "DELETE" });
    setMessage(response.ok ? "ドライバーを無効化しました。" : "ドライバー削除に失敗しました。");
    setSelectedDriver(null);
    await Promise.all([loadDashboard(), loadDriverSettings()]);
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
            <span>営業日 {dashboard?.businessDate ?? "-"}</span>
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
            {activeTab === "dashboard" && <DashboardView dashboard={dashboard} onOpenNotifications={() => setActiveTab("notifications")} />}
            {activeTab === "waiting" && <WaitingTable rows={dashboard.waitingDrivers} />}
            {activeTab === "rides" && <RideTable rows={dashboard.activeRideDrivers} />}
            {activeTab === "today" && <LogTable logs={todayLogs.length ? todayLogs : dashboard.todayLogs} onOpen={openLog} />}
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
              />
            )}
            {activeTab === "clockOuts" && <ClockOutTable logs={clockOuts} />}
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

      <ToastStack toasts={toasts} onClose={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
      {selectedLog && <LogModal log={selectedLog} onClose={() => setSelectedLog(null)} onSave={saveLog} />}
      {selectedDriver && <DriverModal driver={selectedDriver} onClose={() => setSelectedDriver(null)} onSave={saveDriver} onDelete={() => deleteDriver(selectedDriver)} />}
      {addingDriver && <AddDriverModal onClose={() => setAddingDriver(false)} onSave={addDriver} />}
    </main>
  );
}

function DashboardView({ dashboard, onOpenNotifications }: { dashboard: Dashboard; onOpenNotifications: () => void }) {
  return (
    <div className="monitor-stack">
      <WarningArea summary={dashboard.warningSummary ?? []} onClick={onOpenNotifications} />
      <div className="summary-grid">
        <Summary label="出勤・待機中" value={dashboard.summary.workingWaitingCount} />
        <Summary label="送迎中" value={dashboard.summary.activeRideCount} />
      </div>
      <div className="monitor-two-col">
        <section className="monitor-panel dashboard-waiting"><h3>出勤・待機中一覧</h3><WaitingTable rows={dashboard.waitingDrivers} compact /></section>
        <section className="monitor-panel dashboard-rides"><h3>送迎中一覧</h3><RideTable rows={dashboard.activeRideDrivers} compact /></section>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="summary-box"><span>{label}</span><strong>{value}</strong></div>;
}

function WaitingTable({ rows, compact = false }: { rows: any[]; compact?: boolean }) {
  return (
    <Table empty="出勤・待機中のドライバーはいません。">
      <thead><tr><th>ドライバー名</th><th>現在ステータス</th><th>最終更新</th>{!compact && <th>メモ</th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.driverId}><td>{row.driverName}</td><td><StatusBadge status={row.status} /></td><td>{formatTime(row.lastUpdatedAt)}</td>{!compact && <td className="memo-cell">{row.memo ?? ""}</td>}</tr>)}</tbody>
    </Table>
  );
}

function RideTable({ rows, compact = false }: { rows: any[]; compact?: boolean }) {
  return (
    <Table empty="送迎中ドライバーはいません。">
      <thead><tr><th>状態</th><th>ドライバー名</th><th>到着予定</th><th>キャスト名</th><th>目的地</th><th>実際到着</th><th>送迎状態</th><th>最終更新</th>{!compact && <th>メモ</th>}</tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.driverId}>
          <td><StatusBadge status={row.status} /></td><td>{row.driverName}</td><td className="time-strong">{formatTime(row.estimatedArrival)}</td><td>{row.castName ?? "-"}</td><td>{row.destination ?? "-"}</td>
          <td>{formatTime(row.actualArrival)}</td><td><RideStateBadge state={row.rideState} /></td><td>{formatTime(row.lastUpdatedAt)}</td>{!compact && <td className="memo-cell">{row.memo ?? ""}</td>}
        </tr>
      ))}</tbody>
    </Table>
  );
}

function LogTable({ logs, onOpen, fullDate = false }: { logs: any[]; onOpen: (id: string) => void; fullDate?: boolean }) {
  return (
    <Table empty="履歴がありません。">
      <thead><tr><th>時刻</th><th>ドライバー名</th><th>操作</th><th>状態</th><th>種別</th><th>キャスト名</th><th>目的地</th><th>到着予定</th><th>実際到着</th><th>降車時刻</th><th>メモ</th><th>Discord送信</th></tr></thead>
      <tbody>{logs.map((log) => (
        <tr key={log.id} className="click-row" onClick={() => onOpen(log.id)}>
          <td>{fullDate ? formatDateTime(log.datetime) : formatTime(log.datetime)}</td><td>{log.driverName}</td><td>{actionLabels[log.action] ?? log.action}</td><td>{log.status}</td><td>{log.type ?? "-"}</td><td>{log.castName ?? "-"}</td><td>{log.destination ?? "-"}</td>
          <td className="time-strong">{formatTime(log.estimatedArrival)}</td><td>{formatTime(log.actualArrival)}</td><td>{formatTime(log.dropoffTime)}</td><td className="memo-cell">{log.memo ?? ""}</td><td>{log.discordSent ? "送信済み" : "未送信"}</td>
        </tr>
      ))}</tbody>
    </Table>
  );
}

function HistoryView({ drivers, filters, setFilters, searchOpen, setSearchOpen, history, onSearch, onReset, onPage, onOpen }: any) {
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
      <LogTable logs={history.logs} onOpen={onOpen} fullDate />
      <div className="pager"><button className="button secondary" disabled={history.page <= 1} onClick={() => onPage(history.page - 1)}>前へ</button><span>{history.page} / {history.totalPages || 1}</span><button className="button secondary" disabled={history.page >= history.totalPages} onClick={() => onPage(history.page + 1)}>次へ</button></div>
    </div>
  );
}

function ClockOutTable({ logs }: { logs: any[] }) {
  return (
    <Table empty="退勤済みログがありません。">
      <thead><tr><th>ドライバー名</th><th>時給</th><th>出勤時間</th><th>退勤時間</th><th>丸め後</th><th>稼働時間</th><th>時給分</th><th>ガス精算</th><th>走行距離</th><th>ガス代</th><th>合計報酬</th><th>業務報告</th><th>最終更新</th></tr></thead>
      <tbody>{logs.map((log) => <tr key={log.id}><td>{log.driverName}</td><td>{money(log.hourlyWage)}</td><td>-</td><td>{formatTime(log.clockOutTime)}</td><td>{formatTime(log.roundedClockOutTime)}</td><td>{log.workHours ?? "-"}h</td><td>{money(log.wageSubtotal)}</td><td>{formatGasSettlement(log.gasSettlementType)}</td><td>{log.distance ?? "-"}km</td><td>{money(log.gasSubtotal)}</td><td>{money(log.totalPayment)}</td><td className="memo-cell">{log.dailyReport ?? ""}</td><td>{formatTime(log.updatedAt)}</td></tr>)}</tbody>
    </Table>
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
      <Table empty="通知はありません。">
        <thead><tr><th>区分</th><th>通知種別</th><th>発生時刻</th><th>ドライバー</th><th>内容</th><th>重要度</th><th>未読/既読</th><th>操作</th></tr></thead>
        <tbody>{visibleNotifications.map((item: AdminNotification) => (
          <tr key={item.id}>
            <td>{notificationCategoryLabel(item.category)}</td><td>{notificationTypeLabel(item.type)}</td><td>{formatDateTime(item.createdAt)}</td><td>{item.driver?.driverName ?? "-"}</td><td><strong>{item.title}</strong><br /><span className="muted">{item.message}</span></td><td><SeverityBadge severity={item.severity} /></td><td>{item.isRead ? "既読" : "未読"}</td>
            <td><button className="button secondary" type="button" onClick={() => onToggleRead(item)}>{item.isRead ? "未読に戻す" : "既読にする"}</button></td>
          </tr>
        ))}</tbody>
      </Table>
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

function DriverModal({ driver, onClose, onSave, onDelete }: { driver: any; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete: () => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-panel stack" onSubmit={onSave}>
        <div className="between"><h3>ドライバー設定編集</h3><button type="button" className="button secondary" onClick={onClose}>閉じる</button></div>
        <div className="detail-grid">
          <label>ドライバー名<input name="driverName" defaultValue={driver.driverName} required /></label><label>時給<input name="hourlyWage" type="number" defaultValue={driver.hourlyWage} /></label><label>ガス精算タイプ<select name="gasSettlementType" defaultValue={driver.gasSettlementType}><option value="INCLUDED">ガス代込み</option><option value="SEPARATE">ガス別精算</option></select></label>
          <label>ガス単価<input name="gasRate" type="number" step="0.01" defaultValue={driver.gasRate ?? ""} /></label><label>表示順<input name="displayOrder" type="number" defaultValue={driver.displayOrder} /></label><label className="check-row"><input name="isActive" type="checkbox" defaultChecked={driver.isActive} />有効</label>
        </div>
        <div className="between compact-actions"><button className="button danger" type="button" onClick={onDelete}>削除</button><button className="button" type="submit">保存</button></div>
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

function Table({ children, empty }: { children: React.ReactNode; empty: string }) {
  const childArray = React.Children.toArray(children);
  const rowCount = React.Children.count((childArray[1] as any)?.props?.children);
  const isEmpty = rowCount === 0;
  return <div className="table-scroll"><table className="monitor-table">{children}</table>{isEmpty && <p className="empty-state">{empty}</p>}</div>;
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
              <button key={item.id} className={`notification-item ${item.isRead ? "read" : ""}`} type="button" onClick={() => onToggleRead(item)}>
                <span><SeverityBadge severity={item.severity} /> {notificationTypeLabel(item.type)}</span>
                <strong>{item.title}</strong>
                <small>{item.driver?.driverName ?? "-"} / {formatDateTime(item.createdAt)}</small>
                <span>{item.message}</span>
              </button>
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

function ToastStack({ toasts, onClose }: { toasts: AdminNotification[]; onClose: (id: string) => void }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toast toast-${toast.severity.toLowerCase()}`} type="button" onClick={() => onClose(toast.id)}>
          <strong>{toast.title}</strong>
          <span>{toast.driver?.driverName ?? ""}</span>
          <small>{toast.message}</small>
        </button>
      ))}
    </div>
  );
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
  if (type === "ARRIVAL_OVERDUE") return "到着予定超過";
  if (type === "CLOCK_OUT_OVERDUE") return "退勤予定超過";
  if (type === "DISCORD_FAILED") return "Discord送信失敗";
  if (type === "SYSTEM_ERROR") return "システムエラー";
  return type;
}

function notificationCategoryLabel(category: string) {
  return category === "BUSINESS" ? "業務" : "システム";
}

function notificationTypeOptions(category: "BUSINESS" | "SYSTEM") {
  if (category === "BUSINESS") return [{ value: "BUSINESS_ACTION", label: "業務通知" }];
  return [
    { value: "ARRIVAL_OVERDUE", label: "到着予定超過" },
    { value: "CLOCK_OUT_OVERDUE", label: "退勤予定超過" },
    { value: "DISCORD_FAILED", label: "Discord送信失敗" },
    { value: "SYSTEM_ERROR", label: "システムエラー" }
  ];
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
