import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getBusinessDate } from "./time";

export const NOTIFICATION_TYPES = {
  BUSINESS_ACTION: "BUSINESS_ACTION",
  ARRIVAL_OVERDUE: "ARRIVAL_OVERDUE",
  CLOCK_OUT_OVERDUE: "CLOCK_OUT_OVERDUE",
  DISCORD_FAILED: "DISCORD_FAILED",
  SYSTEM_ERROR: "SYSTEM_ERROR"
} as const;

export const NOTIFICATION_CATEGORIES = {
  BUSINESS: "BUSINESS",
  SYSTEM: "SYSTEM"
} as const;

export const severityLabels: Record<string, string> = {
  INFO: "通常",
  WARNING: "注意",
  CRITICAL: "緊急"
};

const ACTIVE_STATUSES = ["出勤中", "事務所待機", "送り中", "迎え中", "戻り中", "その他", "現地到着", "女性降車済み", "現地待機"];

export async function scanOperationalNotifications() {
  const now = new Date();
  const businessDate = getBusinessDate(now);

  const [arrivalLogs, clockInLogs, discordFailedLogs] = await Promise.all([
    prisma.driverLog.findMany({
      where: {
        businessDate,
        affectsStatus: true,
        estimatedArrival: { lt: now },
        actualArrival: null,
        status: { notIn: ["未出勤", "退勤済み"] }
      },
      include: { driver: true },
      orderBy: { estimatedArrival: "asc" },
      take: 100
    }),
    prisma.driverLog.findMany({
      where: {
        businessDate,
        action: "CLOCK_IN",
        affectsStatus: true,
        scheduledClockOut: { lt: now }
      },
      include: { driver: true },
      orderBy: { scheduledClockOut: "asc" },
      take: 100
    }),
    prisma.driverLog.findMany({
      where: {
        businessDate,
        discordSent: false,
        discordWebhookType: { not: null }
      },
      include: { driver: true },
      orderBy: { datetime: "desc" },
      take: 100
    })
  ]);

  await Promise.all(
    arrivalLogs.map((log) =>
      upsertLogNotification({
        type: NOTIFICATION_TYPES.ARRIVAL_OVERDUE,
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        severity: "WARNING",
        title: "到着予定超過",
        message: `${log.driverName} / 到着予定 ${formatClock(log.estimatedArrival)}`,
        driverId: log.driverId,
        relatedLogId: log.id
      })
    )
  );

  const clockOutChecks = await Promise.all(
    clockInLogs.map(async (clockInLog) => {
      const latest = await prisma.driverLog.findFirst({
        where: { driverId: clockInLog.driverId, businessDate, affectsStatus: true },
        orderBy: { datetime: "desc" }
      });
      if (!latest || !ACTIVE_STATUSES.includes(latest.status)) return null;
      return upsertLogNotification({
        type: NOTIFICATION_TYPES.CLOCK_OUT_OVERDUE,
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        severity: "CRITICAL",
        title: "退勤予定超過",
        message: `${clockInLog.driverName} / 退勤予定 ${formatClock(clockInLog.scheduledClockOut)}`,
        driverId: clockInLog.driverId,
        relatedLogId: clockInLog.id
      });
    })
  );

  await Promise.all(clockOutChecks.filter(Boolean));

  await Promise.all(
    discordFailedLogs.map((log) =>
      upsertLogNotification({
        type: NOTIFICATION_TYPES.DISCORD_FAILED,
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        severity: "CRITICAL",
        title: "Discord送信失敗",
        message: `${log.driverName} / ${log.action}`,
        driverId: log.driverId,
        relatedLogId: log.id
      })
    )
  );
}

export async function upsertLogNotification(input: {
  type: string;
  category: "BUSINESS" | "SYSTEM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  driverId?: string | null;
  relatedLogId: string;
}) {
  return prisma.notification.upsert({
    where: {
      type_relatedLogId: {
        type: input.type,
        relatedLogId: input.relatedLogId
      }
    },
    update: {
      category: input.category,
      severity: input.severity,
      title: input.title,
      message: input.message,
      driverId: input.driverId ?? null
    },
    create: {
      type: input.type,
      category: input.category,
      severity: input.severity,
      title: input.title,
      message: input.message,
      driverId: input.driverId ?? null,
      relatedLogId: input.relatedLogId
    }
  });
}

export async function createBusinessNotificationForLog(log: {
  id: string;
  action: string;
  driverId: string;
  driverName: string;
  type: string | null;
  castName: string | null;
  destination: string | null;
  estimatedArrival: Date | null;
  actualArrival: Date | null;
  dropoffTime: Date | null;
  clockOutTime: Date | null;
  waitPlace: string | null;
  datetime: Date;
}) {
  const content = businessNotificationContent(log);
  if (!content) return null;
  return upsertLogNotification({
    type: NOTIFICATION_TYPES.BUSINESS_ACTION,
    category: NOTIFICATION_CATEGORIES.BUSINESS,
    severity: "INFO",
    title: content.title,
    message: content.message,
    driverId: log.driverId,
    relatedLogId: log.id
  });
}

export async function createSystemErrorNotification(source: string, error: unknown) {
  if (process.env.npm_lifecycle_event === "build") return;
  try {
    const message = error instanceof Error ? error.message : "システムエラーが発生しました。";
    await prisma.notification.create({
      data: {
        type: NOTIFICATION_TYPES.SYSTEM_ERROR,
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        severity: "CRITICAL",
        title: "システムエラー",
        message: `${source} / ${message}`.slice(0, 1000)
      }
    });
  } catch {
    // Avoid masking the original error when notification persistence itself fails.
  }
}

export async function getNotificationSummary() {
  await scanOperationalNotifications();
  const [systemUnreadCount, businessUnreadCount, warnings] = await Promise.all([
    prisma.notification.count({ where: { category: NOTIFICATION_CATEGORIES.SYSTEM, isRead: false } }),
    prisma.notification.count({ where: { category: NOTIFICATION_CATEGORIES.BUSINESS, isRead: false } }),
    prisma.notification.groupBy({
      by: ["type", "severity"],
      where: { category: NOTIFICATION_CATEGORIES.SYSTEM, isRead: false, severity: { in: ["WARNING", "CRITICAL"] } },
      _count: { _all: true }
    })
  ]);
  return {
    unreadCount: systemUnreadCount,
    systemUnreadCount,
    businessUnreadCount,
    warningSummary: warnings.map((item) => ({
      type: item.type,
      severity: item.severity,
      count: item._count._all
    }))
  };
}

export function notificationWhereFromSearchParams(searchParams: URLSearchParams): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = {};
  const category = searchParams.get("category");
  if (category === NOTIFICATION_CATEGORIES.BUSINESS || category === NOTIFICATION_CATEGORIES.SYSTEM) where.category = category;
  if (searchParams.get("unreadOnly") === "true") where.isRead = false;
  const type = searchParams.get("type");
  if (type) where.type = type;
  const driverId = searchParams.get("driverId");
  if (driverId) where.driverId = driverId;
  return where;
}

function businessNotificationContent(log: Parameters<typeof createBusinessNotificationForLog>[0]) {
  if (log.action === "MAIL_CONFIRM_SEND") return { title: `📩 ${log.driverName}`, message: `送りメール確認 / ${formatClock(log.datetime)}` };
  if (log.action === "MAIL_CONFIRM_PICKUP") return { title: `📩 ${log.driverName}`, message: `迎えメール確認 / ${formatClock(log.datetime)}` };
  if (log.action === "START_RIDE") {
    const target = log.destination ?? log.castName ?? log.type ?? "送迎開始";
    return { title: `🚕 ${log.driverName}`, message: `${target}へ出発 / ${formatClock(log.estimatedArrival)}` };
  }
  if (log.action === "ARRIVE") {
    const target = log.destination ?? "現地";
    return { title: `📍 ${log.driverName}`, message: `${target}到着 / ${formatClock(log.actualArrival ?? log.datetime)}` };
  }
  if (log.action === "DROPOFF") {
    const cast = log.castName ?? "キャスト";
    return { title: `👋 ${log.driverName}`, message: `${cast}降車 / ${formatClock(log.dropoffTime ?? log.datetime)}` };
  }
  if (log.action === "WAIT_FIELD") return { title: `📍 ${log.driverName}`, message: `現地待機 / ${formatClock(log.datetime)}` };
  if (log.action === "WAIT_OFFICE") return { title: `🏢 ${log.driverName}`, message: `事務所待機 / ${formatClock(log.datetime)}` };
  if (log.action === "CLOCK_OUT") return { title: `🔴 ${log.driverName}`, message: `退勤 / ${formatClock(log.clockOutTime ?? log.datetime)}` };
  return null;
}

function formatClock(value: Date | null) {
  if (!value) return "未設定";
  return value.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
