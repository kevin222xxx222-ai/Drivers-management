type NotificationLike = {
  category?: string;
  type?: string;
  severity?: string;
  title?: string;
  message?: string | null;
  createdAt?: string | Date | null;
  driver?: { driverName?: string | null } | null;
  relatedLog?: LogLike | null;
};

type LogLike = {
  action: string;
  driverName: string;
  type?: string | null;
  castName?: string | null;
  destination?: string | null;
  estimatedArrival?: string | Date | null;
  actualArrival?: string | Date | null;
  dropoffTime?: string | Date | null;
  clockOutTime?: string | Date | null;
  scheduledClockOut?: string | Date | null;
  oldScheduledClockOut?: string | Date | null;
  newScheduledClockOut?: string | Date | null;
  workHours?: unknown;
  totalPayment?: unknown;
  dailyReport?: string | null;
  memo?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  datetime?: string | Date | null;
};

export type BusinessNotificationView = {
  icon: string;
  title: string;
  time: string;
  driverName: string;
  descriptionLines: string[];
  accentColor: number;
  color: string;
  mapUrl?: string;
};

const colors = {
  business: 0x2ecc71,
  ride: 0x3498db,
  arrive: 0xe67e22,
  dropoff: 0x9b59b6,
  wait: 0x95a5a6,
  mail: 0x9b59b6,
  clockout: 0xe74c3c,
  warning: 0xf1c40f,
  system: 0xe74c3c
};

export function buildBusinessNotificationView(log: LogLike, createdAt: string | Date | null | undefined = log.datetime): BusinessNotificationView {
  const driverName = log.driverName || "ドライバー";
  const time = formatClock(createdAt ?? log.datetime);
  const mapUrl = mapUrlFor(log);

  if (log.action === "CLOCK_IN") return view("🟢", "出勤", time, driverName, [
    line("出勤時刻", formatClock(log.datetime)),
    line("退勤予定", formatSmartDateTime(log.scheduledClockOut))
  ], "business", mapUrl);

  if (log.action === "START_RIDE") {
    if (log.type === "送り") return view("🚕", "送り開始", time, driverName, [
      line("キャスト", log.castName),
      line("目的地", log.destination),
      line("到着予定", formatClock(log.estimatedArrival))
    ], "ride", mapUrl);
    if (log.type === "迎え") return view("🙋", "迎え開始", time, driverName, [
      line("キャスト", log.castName),
      line("目的地", log.destination),
      line("到着予定", formatClock(log.estimatedArrival))
    ], "ride", mapUrl);
    if (log.type === "事務所戻り") return view("🏠", "事務所へ戻り中", time, driverName, [
      line("キャスト", log.castName),
      line("到着予定", formatClock(log.estimatedArrival))
    ], "ride", mapUrl);
    return view("📢", "その他", time, driverName, [
      line("目的地", log.destination),
      line("到着予定", formatClock(log.estimatedArrival)),
      line("メモ", log.memo)
    ], "ride", mapUrl);
  }

  if (log.action === "ARRIVE") return view("✅", "現地到着", time, driverName, [
    line("目的地", log.destination),
    line("実際の到着", formatClock(log.actualArrival ?? log.datetime)),
    line("到着予定", formatClock(log.estimatedArrival))
  ], "arrive", mapUrl);

  if (log.action === "DROPOFF") return view("🚪", "女性降車", time, driverName, [
    line("キャスト", log.castName),
    line("目的地", log.destination),
    line("降車時刻", formatClock(log.dropoffTime ?? log.datetime))
  ], "dropoff", mapUrl);

  if (log.action === "WAIT_FIELD") return view("📍", "現地待機", time, driverName, [
    line("待機開始", formatClock(log.datetime)),
    line("キャスト", log.castName),
    line("目的地", log.destination)
  ], "wait", mapUrl);

  if (log.action === "WAIT_OFFICE") return view("🏢", "事務所待機", time, driverName, [
    line("待機開始", formatClock(log.datetime))
  ], "wait", mapUrl);

  if (log.action === "MAIL_CONFIRM_SEND") return view("📩", "送りメール確認", time, driverName, [
    line("確認時刻", formatClock(log.datetime))
  ], "mail");

  if (log.action === "MAIL_CONFIRM_PICKUP") return view("📩", "迎えメール確認", time, driverName, [
    line("確認時刻", formatClock(log.datetime))
  ], "mail");

  if (log.action === "CLOCK_OUT") return view("🔴", "退勤", time, driverName, [
    line("退勤", formatClock(log.clockOutTime ?? log.datetime)),
    line("稼働時間", log.workHours ? `${log.workHours}時間` : ""),
    line("合計報酬", money(log.totalPayment)),
    line("日報", log.dailyReport)
  ], "clockout", mapUrl);

  if (log.action === "UPDATE_SCHEDULED_CLOCK_OUT") return view("🕘", "退勤予定変更", time, driverName, [
    `${formatSmartDateTime(log.oldScheduledClockOut)} → ${formatSmartDateTime(log.newScheduledClockOut)}`
  ], "business");

  return view("📢", log.action, time, driverName, [], "business", mapUrl);
}

export function buildNotificationDisplay(notification: NotificationLike): BusinessNotificationView {
  const log = notification.relatedLog;
  if (log) return buildBusinessNotificationView(log, notification.createdAt ?? log.datetime);

  const driverName = notification.driver?.driverName ?? "ドライバー";
  const time = formatClock(notification.createdAt);
  const severity = notification.severity ?? "";
  const color = severity === "CRITICAL" ? "system" : severity === "WARNING" ? "warning" : "business";
  const icon = severity === "CRITICAL" ? "🚨" : severity === "WARNING" ? "⚠️" : notification.category === "SYSTEM" ? "ℹ️" : "📢";
  const title = cleanupTitle(notification.title || notification.type || "通知");
  return view(icon, title, time, driverName, splitMessage(notification.message), color as keyof typeof colors);
}

function view(icon: string, title: string, time: string, driverName: string, details: Array<string | null | undefined>, color: keyof typeof colors, mapUrl = ""): BusinessNotificationView {
  return {
    icon,
    title,
    time,
    driverName,
    descriptionLines: details.filter(isUsefulLine),
    accentColor: colors[color],
    color,
    mapUrl: mapUrl || undefined
  };
}

function line(label: string, value: unknown) {
  if (!isUsefulValue(value)) return "";
  return `${label}：${value}`;
}

function splitMessage(message?: string | null) {
  return (message ?? "").split("\n").filter(isUsefulLine);
}

function cleanupTitle(title: string) {
  return title.replace(/^[^\s]+\s*/, "").trim() || title;
}

function mapUrlFor(log: LogLike) {
  return log.latitude && log.longitude ? `https://maps.google.com/?q=${log.latitude},${log.longitude}` : "";
}

function formatClock(value?: string | Date | null) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function formatSmartDateTime(value?: string | Date | null) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function toDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function money(value: unknown) {
  if (!isUsefulValue(value)) return "";
  return `${Number(value).toLocaleString()}円`;
}

function isUsefulLine(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && !trimmed.endsWith("：") && !trimmed.includes("：-") && !["-", "なし", "不要", "未設定"].includes(trimmed);
}

function isUsefulValue(value: unknown) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return Boolean(text) && !["-", "なし", "不要", "未設定"].includes(text);
}
