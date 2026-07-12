import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildDiscordNoticePayload } from "@/lib/discord";
import { latestDriverLogOrder } from "@/lib/driver-service";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { calculateClockOutSettlement } from "@/lib/settlement";
import { formatTokyoDateTime, getBusinessDate, parseLocalDateTime } from "@/lib/time";

const ACTIVE_STATUSES = ["出勤中", "事務所待機", "送り中", "迎え中", "戻り中", "その他", "現地到着", "女性降車済み", "現地待機"];

export async function POST(request: Request, context: { params: { driverId: string } }) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const reason = text(body.reason);
    const dailyReport = text(body.dailyReportMemo ?? body.dailyReport);
    const clockOutAt = parseLocalDateTime(String(body.clockOutAt ?? ""));
    const distance = numberOrNull(body.gasDistance ?? body.distance);
    if (!reason) return NextResponse.json({ error: "代理退勤理由は必須です。" }, { status: 400 });
    if (!dailyReport) return NextResponse.json({ error: "日報メモは必須です。" }, { status: 400 });
    if (!clockOutAt || Number.isNaN(clockOutAt.getTime())) return NextResponse.json({ error: "退勤日時が不正です。" }, { status: 400 });
    if (clockOutAt.getTime() > Date.now()) return NextResponse.json({ error: "未来日時では代理退勤できません。" }, { status: 400 });
    if (distance === null || distance < 0) return NextResponse.json({ error: "走行距離を0以上で入力してください。" }, { status: 400 });

    const now = new Date();
    const currentBusinessDate = getBusinessDate(now);
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: context.params.driverId } });
      if (!driver || driver.deletedAt) throw new ApiError("ドライバーが見つかりません。", 404);
      if (!driver.isActive) throw new ApiError("無効なドライバーは代理退勤できません。", 400);

      const latestLog = await tx.driverLog.findFirst({ where: { driverId: driver.id, businessDate: currentBusinessDate, affectsStatus: true }, orderBy: latestDriverLogOrder });
      const currentStatus = latestLog?.status ?? "未出勤";
      if (!ACTIVE_STATUSES.includes(currentStatus)) throw new ApiError("勤務中のドライバーのみ代理退勤できます。", 400);
      const expectedStatus = text(body.expectedStatus);
      if (expectedStatus && expectedStatus !== currentStatus) throw new ApiError("ドライバー本人の操作が更新されています。画面を更新して確認してください。", 409);
      const expectedUpdatedAt = text(body.expectedUpdatedAt);
      if (expectedUpdatedAt && latestLog && new Date(expectedUpdatedAt).getTime() !== latestLog.datetime.getTime()) throw new ApiError("ドライバー本人の操作が更新されています。画面を更新して確認してください。", 409);

      const clockInLog = await tx.driverLog.findFirst({ where: { driverId: driver.id, businessDate: currentBusinessDate, action: "CLOCK_IN", affectsStatus: true }, orderBy: latestDriverLogOrder });
      if (!clockInLog) throw new ApiError("出勤ログがありません。", 400);
      if (clockOutAt.getTime() <= clockInLog.datetime.getTime()) throw new ApiError("退勤日時は出勤日時より後にしてください。", 400);
      const alreadyClockedOut = await tx.driverLog.findFirst({ where: { driverId: driver.id, businessDate: currentBusinessDate, action: "CLOCK_OUT", affectsStatus: true }, orderBy: latestDriverLogOrder });
      if (alreadyClockedOut) throw new ApiError("ドライバー本人の退勤処理が完了しています。画面を更新して確認してください。", 409);

      const settlement = calculateClockOutSettlement({ driver, clockInLog, clockOutTime: clockOutAt, distance });
      const clockOutLog = await tx.driverLog.create({
        data: {
          businessDate: clockInLog.businessDate,
          datetime: clockOutAt,
          driverId: driver.id,
          driverName: driver.driverName,
          action: "CLOCK_OUT",
          status: "退勤済み",
          clockOutTime: settlement.clockOutTime,
          roundedClockOutTime: settlement.roundedClockOutTime,
          workHours: settlement.workHours,
          hourlyWage: settlement.hourlyWage,
          wageSubtotal: settlement.wageSubtotal,
          gasSettlementType: settlement.gasSettlementType,
          gasType: settlement.gasType,
          gasRate: settlement.gasRate,
          distance: settlement.distance,
          gasSubtotal: settlement.gasSubtotal,
          totalPayment: settlement.totalPayment,
          dailyReport,
          memo: `管理者代理退勤：${reason}`,
          affectsStatus: true,
          createdByUserType: "ADMIN",
          createdByUserId: user.admin.id
        }
      });
      const adminLog = await tx.driverLog.create({
        data: {
          businessDate: clockInLog.businessDate,
          datetime: now,
          driverId: driver.id,
          driverName: driver.driverName,
          action: "ADMIN_PROXY_CLOCK_OUT",
          status: "退勤済み",
          clockOutTime: settlement.clockOutTime,
          roundedClockOutTime: settlement.roundedClockOutTime,
          workHours: settlement.workHours,
          totalPayment: settlement.totalPayment,
          memo: `理由：${reason}`,
          affectsStatus: false,
          createdByUserType: "ADMIN",
          createdByUserId: user.admin.id
        }
      });
      await tx.driverLogAudit.create({ data: { driverLogId: clockOutLog.id, beforeJson: toJson({}), afterJson: toJson(clockOutLog), editedByAdminId: user.admin.id, reason } });
      await tx.driverWorkTimeCorrection.create({
        data: {
          driverId: driver.id,
          adminId: user.admin.id,
          correctionType: "ADMIN_PROXY_CLOCK_OUT",
          businessDateAfter: clockInLog.businessDate,
          clockInAfter: clockInLog.datetime,
          clockOutAfter: settlement.clockOutTime,
          workHoursAfter: settlement.workHours,
          wageSubtotalAfter: settlement.wageSubtotal,
          gasSubtotalAfter: settlement.gasSubtotal,
          totalPaymentAfter: settlement.totalPayment,
          reason,
          relatedClockInLogId: clockInLog.id,
          relatedClockOutLogId: clockOutLog.id,
          relatedAdminLogId: adminLog.id
        }
      });
      const notification = await tx.notification.create({
        data: {
          type: "ADMIN_PROXY_CLOCK_OUT",
          category: NOTIFICATION_CATEGORIES.SYSTEM,
          severity: "INFO",
          title: "管理者代理退勤",
          message: `${driver.driverName}\n退勤時刻：${formatTokyoDateTime(settlement.clockOutTime)}\n合計：${settlement.totalPayment.toLocaleString()}円\n理由：${reason}`,
          driverId: driver.id,
          relatedLogId: adminLog.id
        }
      });
      await tx.discordJob.create({
        data: {
          notificationId: notification.id,
          eventLogId: adminLog.id,
          webhookType: "NOTICE",
          payload: buildDiscordNoticePayload({
            title: `🛠 管理者代理退勤｜${driver.driverName}`,
            fields: [
              { name: "出勤", value: formatTokyoDateTime(clockInLog.datetime), inline: true },
              { name: "退勤", value: formatTokyoDateTime(settlement.clockOutTime), inline: true },
              { name: "稼働時間", value: `${settlement.workHours}h`, inline: true },
              { name: "合計", value: `${settlement.totalPayment.toLocaleString()}円`, inline: true },
              { name: "理由", value: reason, inline: false }
            ],
            color: 3447003
          }) as Prisma.InputJsonValue
        }
      });
      const alerts = await tx.clockOutAlert.findMany({ where: { driverId: driver.id, businessDate: clockInLog.businessDate, notificationId: { not: null } }, select: { notificationId: true } });
      const notificationIds = alerts.map((alert) => alert.notificationId).filter((id): id is string => Boolean(id));
      if (notificationIds.length) await tx.discordJob.updateMany({ where: { notificationId: { in: notificationIds }, status: "PENDING" }, data: { status: "CANCELLED", lastError: "管理者代理退勤によりキャンセル" } });
      return { clockOutLog, adminLog, settlement };
    });
    return NextResponse.json({ success: true, log: result.clockOutLog, adminLog: result.adminLog, settlement: result.settlement });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "代理退勤に失敗しました。" }, { status: 400 });
  }
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
