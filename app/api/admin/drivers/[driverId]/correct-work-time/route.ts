import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildDiscordNoticePayload } from "@/lib/discord";
import { latestDriverLogOrder } from "@/lib/driver-service";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { calculateClockOutSettlementFromTimes } from "@/lib/settlement";
import { formatTokyoDateTime, getBusinessDate, parseLocalDateTime } from "@/lib/time";

export async function POST(request: Request, context: { params: { driverId: string } }) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const reason = text(body.reason);
    const clockInAt = parseLocalDateTime(String(body.clockInAt ?? ""));
    const clockOutAt = text(body.clockOutAt) ? parseLocalDateTime(String(body.clockOutAt)) : null;
    if (!reason) return NextResponse.json({ error: "修正理由は必須です。" }, { status: 400 });
    if (!clockInAt || Number.isNaN(clockInAt.getTime())) return NextResponse.json({ error: "出勤日時が不正です。" }, { status: 400 });
    if (clockInAt.getTime() > Date.now()) return NextResponse.json({ error: "未来日時には修正できません。" }, { status: 400 });
    if (clockOutAt && (Number.isNaN(clockOutAt.getTime()) || clockOutAt.getTime() > Date.now())) return NextResponse.json({ error: "退勤日時が不正です。" }, { status: 400 });
    if (clockOutAt && clockOutAt.getTime() <= clockInAt.getTime()) return NextResponse.json({ error: "退勤日時は出勤日時より後にしてください。" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: context.params.driverId } });
      if (!driver || driver.deletedAt) throw new ApiError("ドライバーが見つかりません。", 404);
      if (!driver.isActive) throw new ApiError("無効なドライバーは修正できません。", 400);

      const clockOutLog = await findClockOutLog(tx, driver.id, body.clockOutLogId);
      const baseBusinessDate = clockOutLog?.businessDate ?? getBusinessDate();
      const clockInLog = await tx.driverLog.findFirst({ where: { driverId: driver.id, businessDate: baseBusinessDate, action: "CLOCK_IN", affectsStatus: true }, orderBy: latestDriverLogOrder });
      if (!clockInLog) throw new ApiError("出勤ログが見つかりません。", 404);
      if (clockOutLog && !clockOutAt) throw new ApiError("退勤済み記録の修正には退勤日時が必要です。", 400);
      const beforeClockOutTime = clockOutLog?.clockOutTime ?? null;
      const newBusinessDate = getBusinessDate(clockInAt);
      const currentLatest = await tx.driverLog.findFirst({ where: { driverId: driver.id, businessDate: baseBusinessDate, affectsStatus: true }, orderBy: latestDriverLogOrder });
      const expectedUpdatedAt = text(body.expectedUpdatedAt);
      if (expectedUpdatedAt && currentLatest && new Date(expectedUpdatedAt).getTime() !== currentLatest.datetime.getTime()) throw new ApiError("勤務記録が更新されています。画面を更新して確認してください。", 409);
      if (clockInLog.datetime.getTime() === clockInAt.getTime() && (!clockOutLog || beforeClockOutTime?.getTime() === clockOutAt?.getTime())) throw new ApiError("同じ時刻への修正はできません。", 400);

      const beforeSettlement = clockOutLog ? snapshotSettlement(clockOutLog) : null;
      const settlement = clockOutLog && clockOutAt ? calculateClockOutSettlementFromTimes({ driver, clockInTime: clockInAt, clockOutTime: clockOutAt, distance: numberOrNull(clockOutLog.distance) }) : null;
      const updatedClockIn = await tx.driverLog.update({ where: { id: clockInLog.id }, data: { datetime: clockInAt, businessDate: newBusinessDate, updatedByUserType: "ADMIN", updatedByUserId: user.admin.id } });
      let updatedClockOut = null;
      if (clockOutLog && settlement) {
        updatedClockOut = await tx.driverLog.update({
          where: { id: clockOutLog.id },
          data: {
            businessDate: newBusinessDate,
            datetime: settlement.clockOutTime,
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
            updatedByUserType: "ADMIN",
            updatedByUserId: user.admin.id
          }
        });
      }

      const action = updatedClockOut ? "ADMIN_WORK_TIME_CORRECTION" : "ADMIN_CLOCK_IN_CORRECTION";
      const adminLog = await tx.driverLog.create({
        data: {
          businessDate: newBusinessDate,
          datetime: new Date(),
          driverId: driver.id,
          driverName: driver.driverName,
          action,
          status: currentLatest?.status ?? (updatedClockOut ? "退勤済み" : "出勤中"),
          memo: workTimeMemo({ beforeClockIn: clockInLog.datetime, afterClockIn: clockInAt, beforeClockOut: beforeClockOutTime, afterClockOut: clockOutAt, reason }),
          affectsStatus: false,
          createdByUserType: "ADMIN",
          createdByUserId: user.admin.id
        }
      });
      await tx.driverLogAudit.create({ data: { driverLogId: updatedClockIn.id, beforeJson: toJson(clockInLog), afterJson: toJson(updatedClockIn), editedByAdminId: user.admin.id, reason } });
      if (clockOutLog && updatedClockOut) await tx.driverLogAudit.create({ data: { driverLogId: updatedClockOut.id, beforeJson: toJson(clockOutLog), afterJson: toJson(updatedClockOut), editedByAdminId: user.admin.id, reason } });
      const correction = await tx.driverWorkTimeCorrection.create({
        data: {
          driverId: driver.id,
          adminId: user.admin.id,
          correctionType: updatedClockOut ? "ADMIN_WORK_TIME_CORRECTION" : "ADMIN_CLOCK_IN_CORRECTION",
          businessDateBefore: clockInLog.businessDate,
          businessDateAfter: newBusinessDate,
          clockInBefore: clockInLog.datetime,
          clockInAfter: clockInAt,
          clockOutBefore: beforeClockOutTime,
          clockOutAfter: clockOutAt,
          workHoursBefore: beforeSettlement?.workHours ?? null,
          workHoursAfter: settlement?.workHours ?? null,
          wageSubtotalBefore: beforeSettlement?.wageSubtotal ?? null,
          wageSubtotalAfter: settlement?.wageSubtotal ?? null,
          gasSubtotalBefore: beforeSettlement?.gasSubtotal ?? null,
          gasSubtotalAfter: settlement?.gasSubtotal ?? null,
          totalPaymentBefore: beforeSettlement?.totalPayment ?? null,
          totalPaymentAfter: settlement?.totalPayment ?? null,
          reason,
          relatedClockInLogId: updatedClockIn.id,
          relatedClockOutLogId: updatedClockOut?.id ?? null,
          relatedAdminLogId: adminLog.id
        }
      });
      const notification = await tx.notification.create({
        data: {
          type: correction.correctionType,
          category: NOTIFICATION_CATEGORIES.SYSTEM,
          severity: "INFO",
          title: updatedClockOut ? "勤務時間修正" : "出勤時刻修正",
          message: `${driver.driverName}\n${workTimeMemo({ beforeClockIn: clockInLog.datetime, afterClockIn: clockInAt, beforeClockOut: beforeClockOutTime, afterClockOut: clockOutAt, reason })}`,
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
            title: `🛠 ${updatedClockOut ? "勤務時間修正" : "出勤時刻修正"}｜${driver.driverName}`,
            fields: [
              { name: "出勤", value: `${formatTokyoDateTime(clockInLog.datetime)} → ${formatTokyoDateTime(clockInAt)}`, inline: false },
              ...(beforeClockOutTime && clockOutAt ? [{ name: "退勤", value: `${formatTokyoDateTime(beforeClockOutTime)} → ${formatTokyoDateTime(clockOutAt)}`, inline: false }] : []),
              ...(settlement ? [{ name: "合計", value: `${settlement.totalPayment.toLocaleString()}円`, inline: true }] : []),
              { name: "理由", value: reason, inline: false }
            ],
            color: 3447003
          }) as Prisma.InputJsonValue
        }
      });
      return { clockInLog: updatedClockIn, clockOutLog: updatedClockOut, adminLog, settlement };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "勤務時間修正に失敗しました。" }, { status: 400 });
  }
}

async function findClockOutLog(tx: Prisma.TransactionClient, driverId: string, clockOutLogId: unknown) {
  const id = text(clockOutLogId);
  if (id) return tx.driverLog.findFirst({ where: { id, driverId, action: "CLOCK_OUT" } });
  return null;
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

function snapshotSettlement(log: { workHours: unknown; wageSubtotal: number | null; gasSubtotal: number | null; totalPayment: number | null }) {
  return {
    workHours: numberOrNull(log.workHours),
    wageSubtotal: log.wageSubtotal,
    gasSubtotal: log.gasSubtotal,
    totalPayment: log.totalPayment
  };
}

function workTimeMemo(input: { beforeClockIn: Date; afterClockIn: Date; beforeClockOut: Date | null; afterClockOut: Date | null; reason: string }) {
  return [
    `出勤：${formatTokyoDateTime(input.beforeClockIn)} → ${formatTokyoDateTime(input.afterClockIn)}`,
    input.beforeClockOut && input.afterClockOut ? `退勤：${formatTokyoDateTime(input.beforeClockOut)} → ${formatTokyoDateTime(input.afterClockOut)}` : "",
    `理由：${input.reason}`
  ].filter(Boolean).join("\n");
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
