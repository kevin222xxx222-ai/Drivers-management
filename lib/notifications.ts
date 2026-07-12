import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getBusinessDate } from "./time";
import { buildDiscordNoticePayload } from "./discord";
import { buildBusinessNotificationView } from "./notification-view";

const latestDriverLogOrder = [{ datetime: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

export const NOTIFICATION_TYPES = {
  BUSINESS_ACTION: "BUSINESS_ACTION",
  CLOCK_IN: "CLOCK_IN",
  SCHEDULED_CLOCK_OUT_UPDATED: "SCHEDULED_CLOCK_OUT_UPDATED",
  ARRIVAL_OVERDUE: "ARRIVAL_OVERDUE",
  CLOCK_OUT_OVERDUE: "CLOCK_OUT_OVERDUE",
  CLOCKOUT_60_MIN_BEFORE: "CLOCKOUT_60_MIN_BEFORE",
  CLOCKOUT_30_MIN_BEFORE: "CLOCKOUT_30_MIN_BEFORE",
  CLOCKOUT_15_MIN_BEFORE: "CLOCKOUT_15_MIN_BEFORE",
  CLOCKOUT_OVER: "CLOCKOUT_OVER",
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

  const [arrivalLogs, clockInLogs, discordFailedJobs] = await Promise.all([
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
        scheduledClockOut: { not: null }
      },
      include: { driver: true },
      orderBy: { scheduledClockOut: "asc" },
      take: 100
    }),
    prisma.discordJob.findMany({
      where: {
        status: "FAILED",
        eventLogId: { not: null }
      },
      orderBy: { failedAt: "desc" },
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

  await Promise.all(clockInLogs.map((clockInLog) => scanClockOutAlert(clockInLog, businessDate, now)));

  await Promise.all(
    discordFailedJobs.map(async (job) => {
      if (!job.eventLogId) return null;
      const log = await prisma.driverLog.findUnique({ where: { id: job.eventLogId } });
      if (!log) return null;
      return upsertLogNotification({
        type: NOTIFICATION_TYPES.DISCORD_FAILED,
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        severity: "CRITICAL",
        title: "Discord送信失敗",
        message: `${log.driverName} / ${log.action}`,
        driverId: log.driverId,
        relatedLogId: log.id
      });
    })
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

async function scanClockOutAlert(clockInLog: {
  id: string;
  driverId: string;
  driverName: string;
  scheduledClockOut: Date | null;
}, businessDate: Date, now: Date) {
  if (!clockInLog.scheduledClockOut) return null;
  const latest = await prisma.driverLog.findFirst({
    where: { driverId: clockInLog.driverId, businessDate, affectsStatus: true },
    orderBy: latestDriverLogOrder
  });
  if (!latest || !ACTIVE_STATUSES.includes(latest.status)) return null;

  const phase = clockOutAlertPhase(clockInLog.scheduledClockOut, now);
  if (!phase) return null;

  logClockOutAlert("clock_out_alert_candidate", {
    driverId: clockInLog.driverId,
    scheduledClockOut: clockInLog.scheduledClockOut.toISOString(),
    alertType: phase.phase
  });

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.clockOutAlert.createMany({
      data: [{
        driverId: clockInLog.driverId,
        businessDate,
        scheduledClockOut: clockInLog.scheduledClockOut!,
        phase: phase.phase
      }],
      skipDuplicates: true
    });

    if (created.count === 0) return { skipped: true as const, reason: "already-created" };

    const alert = await tx.clockOutAlert.findFirst({
      where: {
        driverId: clockInLog.driverId,
        businessDate,
        scheduledClockOut: clockInLog.scheduledClockOut!,
        phase: phase.phase
      }
    });
    if (!alert) throw new Error("退勤予定アラートの作成結果を取得できません。");

    const notification = await tx.notification.create({
      data: {
        type: phase.type,
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        severity: phase.severity,
        title: phase.title,
        message: `${clockInLog.driverName}\n退勤予定：${formatMonthDayTime(clockInLog.scheduledClockOut)}\n現在ステータス：${latest.status}`,
        driverId: clockInLog.driverId
      }
    });

    const payload = buildDiscordNoticePayload({
      title: `${phase.icon} ${phase.title}｜${clockInLog.driverName}`,
      color: phase.severity === "CRITICAL" ? 15158332 : phase.severity === "WARNING" ? 16753920 : 3447003,
      fields: [
        { name: "退勤予定", value: formatMonthDayTime(clockInLog.scheduledClockOut), inline: true },
        { name: "現在ステータス", value: latest.status, inline: true }
      ]
    }) as Prisma.InputJsonValue;

    const discordJob = await tx.discordJob.create({
      data: {
        notificationId: notification.id,
        webhookType: "NOTICE",
        payload
      }
    });

    await tx.clockOutAlert.update({
      where: { id: alert.id },
      data: { notificationId: notification.id }
    });

    return { skipped: false as const, alert, notification, discordJob };
  });

  if (result.skipped) {
    logClockOutAlert("clock_out_alert_skipped", {
      reason: result.reason,
      phase: phase.phase
    });
    return null;
  }

  logClockOutAlert("clock_out_alert_created", {
    alertId: result.alert.id,
    notificationId: result.notification.id,
    discordJobId: result.discordJob.id
  });
  return result.notification;
}

function clockOutAlertPhase(scheduledClockOut: Date, now: Date) {
  const diff = scheduledClockOut.getTime() - now.getTime();
  const minute = 60 * 1000;
  if (diff <= 0) return { phase: "OVER", type: NOTIFICATION_TYPES.CLOCKOUT_OVER, severity: "CRITICAL" as const, icon: "🚨", title: "退勤予定超過" };
  if (diff <= 15 * minute) return { phase: "15", type: NOTIFICATION_TYPES.CLOCKOUT_15_MIN_BEFORE, severity: "WARNING" as const, icon: "⚠️", title: "退勤予定15分前" };
  if (diff <= 30 * minute) return { phase: "30", type: NOTIFICATION_TYPES.CLOCKOUT_30_MIN_BEFORE, severity: "WARNING" as const, icon: "⚠️", title: "退勤予定30分前" };
  if (diff <= 60 * minute) return { phase: "60", type: NOTIFICATION_TYPES.CLOCKOUT_60_MIN_BEFORE, severity: "INFO" as const, icon: "⏰", title: "退勤予定1時間前" };
  return null;
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
  scheduledClockOut?: Date | null;
  oldScheduledClockOut?: Date | null;
  newScheduledClockOut?: Date | null;
  waitPlace: string | null;
  datetime: Date;
}) {
  const content = businessNotificationContent(log);
  if (!content) return null;
  return upsertLogNotification({
    type: businessNotificationType(log.action),
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
  const view = buildBusinessNotificationView(log);
  if (!view.title) return null;
  return {
    title: `${view.icon} ${view.driverName} / ${view.title}`,
    message: view.descriptionLines.join("\n")
  };
}

function businessNotificationType(action: string) {
  if (action === "CLOCK_IN") return NOTIFICATION_TYPES.CLOCK_IN;
  if (action === "UPDATE_SCHEDULED_CLOCK_OUT") return NOTIFICATION_TYPES.SCHEDULED_CLOCK_OUT_UPDATED;
  return NOTIFICATION_TYPES.BUSINESS_ACTION;
}

function formatClock(value: Date | null) {
  if (!value) return "未設定";
  return value.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function formatMonthDayTime(value: Date | null) {
  if (!value) return "未設定";
  return value.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function logClockOutAlert(event: string, data: Record<string, unknown>) {
  if (process.env.CLOCK_OUT_ALERT_LOGGING !== "true") return;
  console.info(JSON.stringify({ event, ...data }));
}
