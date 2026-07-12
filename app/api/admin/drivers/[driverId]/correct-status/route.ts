import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildDiscordNoticePayload } from "@/lib/discord";
import { latestDriverLogOrder } from "@/lib/driver-service";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { formatTokyoTime, getBusinessDate, parseLocalDateTime } from "@/lib/time";

const allowedStatuses = ["出勤中", "送り中", "迎え中", "戻り中", "その他", "現地到着", "女性降車済み", "現地待機", "事務所待機"];
const rideStatuses = ["送り中", "迎え中", "戻り中", "その他"];
const rideTypeForStatus: Record<string, string> = {
  "送り中": "送り",
  "迎え中": "迎え",
  "戻り中": "事務所戻り",
  "その他": "その他"
};

export async function POST(request: Request, context: { params: { driverId: string } }) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const afterStatus = text(body.status);
    const reason = text(body.reason);
    if (!afterStatus || !allowedStatuses.includes(afterStatus)) return NextResponse.json({ error: "修正後ステータスが正しくありません。" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "修正理由は必須です。" }, { status: 400 });
    if (reason.length > 500) return NextResponse.json({ error: "修正理由は500文字以内で入力してください。" }, { status: 400 });

    const businessDate = getBusinessDate();
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: context.params.driverId } });
      if (!driver || driver.deletedAt) throw new ApiError("ドライバーが見つかりません。", 404);
      if (!driver.isActive) throw new ApiError("無効なドライバーは修正できません。", 400);

      const latestLog = await tx.driverLog.findFirst({
        where: { driverId: driver.id, businessDate, affectsStatus: true },
        orderBy: latestDriverLogOrder
      });
      const beforeStatus = latestLog?.status ?? "未出勤";
      if (beforeStatus === "未出勤" || beforeStatus === "退勤済み") throw new ApiError("未出勤・退勤済みは通常の状態修正対象外です。", 400);
      if (beforeStatus === afterStatus) throw new ApiError("現在と同じステータスです。", 400);

      const expectedStatus = text(body.expectedStatus);
      if (expectedStatus && expectedStatus !== beforeStatus) {
        throw new ApiError("ドライバー本人の操作により状態が更新されています。画面を再読み込みして確認してください。", 409);
      }
      const expectedUpdatedAt = text(body.expectedUpdatedAt);
      if (expectedUpdatedAt && latestLog && new Date(expectedUpdatedAt).getTime() !== latestLog.datetime.getTime()) {
        throw new ApiError("ドライバー本人の操作により状態が更新されています。画面を再読み込みして確認してください。", 409);
      }

      const activeRide = await tx.driverLog.findFirst({
        where: { driverId: driver.id, businessDate, action: "START_RIDE" },
        orderBy: latestDriverLogOrder
      });
      const explicitEstimatedArrival = parseOptionalLocalDateTime(body.estimatedArrival ?? body.scheduledArrival);
      let rideType = text(body.rideType) ?? (rideStatuses.includes(afterStatus) ? rideTypeForStatus[afterStatus] : latestLog?.type ?? activeRide?.type ?? null);
      let destination = text(body.destination) ?? latestLog?.destination ?? activeRide?.destination ?? null;
      let castName = text(body.castName) ?? latestLog?.castName ?? activeRide?.castName ?? null;
      let memo = text(body.memo) ?? latestLog?.memo ?? activeRide?.memo ?? null;
      let estimatedArrival = explicitEstimatedArrival ?? latestLog?.estimatedArrival ?? activeRide?.estimatedArrival ?? null;
      let actualArrival = latestLog?.actualArrival ?? activeRide?.actualArrival ?? null;

      if (afterStatus === "送り中") {
        rideType = "送り";
        requireRideFields(afterStatus, castName, destination, estimatedArrival);
      } else if (afterStatus === "迎え中") {
        rideType = "迎え";
        requireRideFields(afterStatus, castName, destination, estimatedArrival);
      } else if (afterStatus === "戻り中") {
        rideType = "事務所戻り";
        destination = "事務所";
      } else if (afterStatus === "その他") {
        rideType = "その他";
        if (!memo) throw new ApiError("「その他」の内容をメモへ入力してください。", 400);
      } else if (afterStatus === "現地到着") {
        if (!destination) throw new ApiError("現地到着へ修正するには、目的地が必要です。", 400);
        actualArrival = actualArrival ?? now;
      } else if (afterStatus === "女性降車済み") {
        if (!castName) throw new ApiError("女性降車済みへ修正するには、キャスト名が必要です。", 400);
      } else if (afterStatus === "現地待機") {
        if (!destination) throw new ApiError("現地待機へ修正するには、目的地が必要です。", 400);
      }

      memo = memo ?? `管理者代理修正：${reason}`;

      const correctionLog = await tx.driverLog.create({
        data: {
          businessDate,
          datetime: now,
          driverId: driver.id,
          driverName: driver.driverName,
          action: "ADMIN_STATUS_CORRECTION",
          status: afterStatus,
          type: rideStatuses.includes(afterStatus) ? rideType : latestLog?.type ?? activeRide?.type ?? null,
          castName,
          destination,
          estimatedArrival: rideStatuses.includes(afterStatus) || afterStatus === "現地到着" ? estimatedArrival : null,
          actualArrival: afterStatus === "現地到着" ? actualArrival : null,
          dropoffTime: afterStatus === "女性降車済み" ? now : null,
          waitPlace: afterStatus === "現地待機" ? "現地" : afterStatus === "事務所待機" ? "事務所" : null,
          memo,
          affectsStatus: true,
          createdByUserType: "ADMIN",
          createdByUserId: user.admin.id
        }
      });

      const correction = await tx.driverStatusCorrection.create({
        data: {
          driverId: driver.id,
          adminId: user.admin.id,
          beforeStatus,
          afterStatus,
          reason,
          relatedLogId: correctionLog.id
        }
      });

      await tx.driverLogAudit.create({
        data: {
          driverLogId: correctionLog.id,
          beforeJson: toJson({ beforeStatus, latestLogId: latestLog?.id ?? null }),
          afterJson: toJson(correctionLog),
          editedByAdminId: user.admin.id,
          reason
        }
      });

      const notification = await tx.notification.create({
        data: {
          type: "ADMIN_STATUS_CORRECTION",
          category: NOTIFICATION_CATEGORIES.SYSTEM,
          severity: "INFO",
          title: "管理者代理修正",
          message: correctionMessage({
            driverName: driver.driverName,
            beforeStatus,
            afterStatus,
            castName,
            destination,
            estimatedArrival,
            memo,
            reason
          }),
          driverId: driver.id,
          relatedLogId: correctionLog.id
        }
      });

      const discordFields = correctionFields({ beforeStatus, afterStatus, castName, destination, estimatedArrival, memo, reason });
      const payload = buildDiscordNoticePayload({
        title: `🛠 管理者修正｜${driver.driverName}｜${afterStatus === "戻り中" ? "事務所戻り中" : afterStatus}`,
        color: 3447003,
        fields: discordFields
      }) as Prisma.InputJsonValue;
      await tx.discordJob.create({
        data: {
          notificationId: notification.id,
          eventLogId: correctionLog.id,
          webhookType: "NOTICE",
          payload
        }
      });

      return { driver, correction, correctionLog, beforeStatus };
    });

    return NextResponse.json({
      success: true,
      driver: {
        id: result.driver.id,
        driverName: result.driver.driverName,
        currentStatus: result.correction.afterStatus
      },
      correctionLog: {
        beforeStatus: result.beforeStatus,
        afterStatus: result.correction.afterStatus,
        reason: result.correction.reason,
        logId: result.correctionLog.id
      }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "状態修正に失敗しました。" }, { status: 400 });
  }
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function text(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseOptionalLocalDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = parseLocalDateTime(value.trim());
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function requireRideFields(status: string, castName: string | null, destination: string | null, estimatedArrival: Date | null) {
  const missing = [];
  if (!castName) missing.push("キャスト名");
  if (!destination) missing.push("目的地");
  if (!estimatedArrival) missing.push("到着予定");
  if (missing.length) throw new ApiError(`${status}へ修正するには、${missing.join("・")}が必要です。`, 400);
}

function correctionMessage(input: {
  driverName: string;
  beforeStatus: string;
  afterStatus: string;
  castName: string | null;
  destination: string | null;
  estimatedArrival: Date | null;
  memo: string | null;
  reason: string;
}) {
  return [
    input.driverName,
    `修正前：${input.beforeStatus}`,
    `修正後：${input.afterStatus}`,
    input.castName ? `キャスト：${input.castName}` : "",
    input.destination ? `目的地：${input.destination}` : "",
    input.estimatedArrival ? `到着予定：${formatTokyoTime(input.estimatedArrival)}` : "",
    input.afterStatus === "その他" && input.memo ? `メモ：${input.memo}` : "",
    `理由：${input.reason}`
  ].filter(Boolean).join("\n");
}

function correctionFields(input: {
  beforeStatus: string;
  afterStatus: string;
  castName: string | null;
  destination: string | null;
  estimatedArrival: Date | null;
  memo: string | null;
  reason: string;
}) {
  return [
    { name: "修正前", value: input.beforeStatus, inline: true },
    { name: "修正後", value: input.afterStatus, inline: true },
    input.castName ? { name: "キャスト", value: input.castName, inline: true } : null,
    input.destination ? { name: "目的地", value: input.destination, inline: true } : null,
    input.estimatedArrival ? { name: "到着予定", value: formatTokyoTime(input.estimatedArrival), inline: true } : null,
    input.afterStatus === "その他" && input.memo ? { name: "メモ", value: input.memo, inline: false } : null,
    { name: "理由", value: input.reason, inline: false }
  ].filter((field): field is { name: string; value: string; inline: boolean } => Boolean(field));
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
