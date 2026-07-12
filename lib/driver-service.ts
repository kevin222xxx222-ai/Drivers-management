import { Prisma, Driver } from "@prisma/client";
import { ACTIONS, Action, RIDE_TYPES, STATUSES, statusForRideType } from "./constants";
import { prisma } from "./prisma";
import { calculateClockOutSettlement } from "./settlement";
import { formatBusinessDate, getBusinessDate, parseLocalDateTime } from "./time";
import { webhookTypeForAction } from "./discord";
import { enqueueDiscordJobForLog } from "./discord-jobs";
import { createBusinessNotificationForLog } from "./notifications";

export type Actor = { userType: "DRIVER" | "ADMIN"; userId: string };
export const latestDriverLogOrder = [{ datetime: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

export async function getLatestStatusLog(driverId: string, businessDate = getBusinessDate()) {
  return prisma.driverLog.findFirst({
    where: { driverId, businessDate, affectsStatus: true },
    orderBy: latestDriverLogOrder
  });
}

export async function getCurrentStatus(driverId: string, businessDate = getBusinessDate()) {
  const latest = await getLatestStatusLog(driverId, businessDate);
  return latest?.status ?? STATUSES.NOT_WORKING;
}

export async function getLatestRideLog(driverId: string, businessDate = getBusinessDate()) {
  const latestStatusLog = await getLatestStatusLog(driverId, businessDate);
  if (!latestStatusLog || !rideContextStatuses.includes(latestStatusLog.status)) return null;
  if (rideContextActions.includes(latestStatusLog.action)) return latestStatusLog;
  return prisma.driverLog.findFirst({
    where: {
      driverId,
      businessDate,
      datetime: { lte: latestStatusLog.datetime },
      action: { in: rideContextActions }
    },
    orderBy: latestDriverLogOrder
  });
}

export async function getLatestClockInLog(driverId: string, businessDate = getBusinessDate()) {
  return prisma.driverLog.findFirst({
    where: { driverId, businessDate, action: "CLOCK_IN", affectsStatus: true },
    orderBy: latestDriverLogOrder
  });
}

export async function getDriverPageState(driver: Driver) {
  const businessDate = getBusinessDate();
  const [latestStatusLog, latestRideLog, latestClockInLog, todayLogs, latestStatusCorrection, latestWorkTimeCorrection] = await Promise.all([
    getLatestStatusLog(driver.id, businessDate),
    getLatestRideLog(driver.id, businessDate),
    getLatestClockInLog(driver.id, businessDate),
    prisma.driverLog.findMany({
      where: { driverId: driver.id, businessDate },
      orderBy: latestDriverLogOrder
    }),
    prisma.driverStatusCorrection.findFirst({
      where: { driverId: driver.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        beforeStatus: true,
        afterStatus: true,
        reason: true,
        createdAt: true
      }
    }),
    prisma.driverWorkTimeCorrection.findFirst({
      where: { driverId: driver.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        correctionType: true,
        reason: true,
        clockInBefore: true,
        clockInAfter: true,
        clockOutBefore: true,
        clockOutAfter: true,
        createdAt: true
      }
    })
  ]);
  const currentStatus = latestStatusLog?.status ?? STATUSES.NOT_WORKING;
  const latestAdminCorrection = normalizeLatestAdminCorrection(latestStatusCorrection, latestWorkTimeCorrection);
  return {
    driver,
    businessDate: formatBusinessDate(businessDate),
    currentStatus,
    latestStatusLog,
    latestRideLog,
    latestClockInLog,
    latestAdminCorrection,
    scheduledClockOut: latestClockInLog?.scheduledClockOut ?? null,
    todayLogs,
    availableActions: availableActions(currentStatus, latestRideLog?.type)
  };
}

function normalizeLatestAdminCorrection(
  statusCorrection: { id: string; beforeStatus: string; afterStatus: string; reason: string; createdAt: Date } | null,
  workTimeCorrection: { id: string; correctionType: string; reason: string; clockInBefore: Date | null; clockInAfter: Date | null; clockOutBefore: Date | null; clockOutAfter: Date | null; createdAt: Date } | null
) {
  if (!workTimeCorrection || (statusCorrection && statusCorrection.createdAt > workTimeCorrection.createdAt)) return statusCorrection;
  const afterStatus = workTimeCorrection.correctionType === "ADMIN_PROXY_CLOCK_OUT" ? STATUSES.CLOCKED_OUT : "勤務時間修正";
  return {
    id: workTimeCorrection.id,
    beforeStatus: workTimeCorrection.correctionType === "ADMIN_PROXY_CLOCK_OUT" ? "勤務中" : "修正前",
    afterStatus,
    reason: workTimeCorrection.reason,
    createdAt: workTimeCorrection.createdAt
  };
}

export function availableActions(currentStatus: string, latestRideType?: string | null) {
  if (currentStatus === STATUSES.NOT_WORKING || currentStatus === STATUSES.CLOCKED_OUT) return ["CLOCK_IN"];
  const common = ["MAIL_CONFIRM_SEND", "MAIL_CONFIRM_PICKUP", "CLOCK_OUT"];
  if (currentStatus === STATUSES.WORKING) return ["START_RIDE", "WAIT_FIELD", "WAIT_OFFICE", ...common];
  if (([STATUSES.SENDING, STATUSES.PICKING_UP, STATUSES.RETURNING, STATUSES.OTHER] as string[]).includes(currentStatus)) return ["ARRIVE", ...common];
  if (currentStatus === STATUSES.ARRIVED) {
    const actions = ["WAIT_FIELD", "WAIT_OFFICE", "START_RIDE", ...common];
    if (latestRideType === "送り" || latestRideType === "事務所戻り") actions.unshift("DROPOFF");
    return actions;
  }
  if (currentStatus === STATUSES.DROPPED_OFF) return ["WAIT_FIELD", "WAIT_OFFICE", "START_RIDE", ...common];
  if (currentStatus === STATUSES.WAIT_FIELD) return ["START_RIDE", "WAIT_OFFICE", ...common];
  if (currentStatus === STATUSES.WAIT_OFFICE) return ["START_RIDE", ...common];
  return common;
}

const rideContextStatuses = [
  STATUSES.SENDING,
  STATUSES.PICKING_UP,
  STATUSES.RETURNING,
  STATUSES.OTHER,
  STATUSES.ARRIVED,
  STATUSES.DROPPED_OFF,
  STATUSES.WAIT_FIELD
] as string[];

const rideContextActions = ["START_RIDE", "ARRIVE", "DROPOFF", "WAIT_FIELD", "ADMIN_STATUS_CORRECTION"];

export async function createDriverLog(params: {
  driver: Driver;
  actor: Actor;
  input: Record<string, unknown>;
}) {
  const action = String(params.input.action ?? "") as Action;
  if (!ACTIONS.includes(action)) throw new Error("許可されていない操作です。");

  const now = new Date();
  const businessDate = getBusinessDate(now);
  const currentStatus = await getCurrentStatus(params.driver.id, businessDate);
  const latestRide = await getLatestRideLog(params.driver.id, businessDate);
  const base: Prisma.DriverLogCreateInput = {
    businessDate,
    datetime: now,
    driver: { connect: { id: params.driver.id } },
    driverName: params.driver.driverName,
    action,
    status: currentStatus,
    createdByUserType: params.actor.userType,
    createdByUserId: params.actor.userId,
    ...locationData(params.input)
  };

  let data: Prisma.DriverLogCreateInput;

  if (action === "CLOCK_IN") {
    if (!([STATUSES.NOT_WORKING, STATUSES.CLOCKED_OUT] as string[]).includes(currentStatus)) throw new Error("現在の状態では出勤できません。");
    const scheduledClockOut = parseLocalDateTime(String(params.input.scheduledClockOut ?? ""));
    if (!scheduledClockOut) throw new Error("退勤予定時刻は必須です。");
    data = { ...base, status: STATUSES.WORKING, scheduledClockOut, memo: text(params.input.memo), affectsStatus: true };
  } else if (action === "START_RIDE") {
    if (!([STATUSES.WORKING, STATUSES.WAIT_OFFICE, STATUSES.WAIT_FIELD, STATUSES.DROPPED_OFF, STATUSES.ARRIVED] as string[]).includes(currentStatus)) {
      throw new Error("現在の状態では送迎開始できません。");
    }
    const type = String(params.input.type ?? "");
    if (!RIDE_TYPES.includes(type as never)) throw new Error("Typeを選択してください。");
    const destination = type === "事務所戻り" ? "事務所" : text(params.input.destination);
    if (!destination) throw new Error("目的地は必須です。");
    const travelMinutes = Number(params.input.travelMinutes);
    if (!Number.isInteger(travelMinutes) || travelMinutes < 1) throw new Error("移動時間は1以上の整数で入力してください。");
    const castName = text(params.input.castName);
    if (["送り", "迎え"].includes(type) && !castName) throw new Error("キャスト名は必須です。");
    data = {
      ...base,
      status: statusForRideType(type),
      type,
      castName,
      destination,
      travelMinutes,
      estimatedArrival: new Date(now.getTime() + travelMinutes * 60_000),
      memo: text(params.input.memo),
      affectsStatus: true
    };
  } else if (action === "ARRIVE") {
    if (!([STATUSES.SENDING, STATUSES.PICKING_UP, STATUSES.RETURNING, STATUSES.OTHER] as string[]).includes(currentStatus)) throw new Error("現在の状態では現地到着にできません。");
    if (!latestRide) throw new Error("直前の送迎開始ログがありません。");
    data = {
      ...base,
      status: STATUSES.ARRIVED,
      type: latestRide.type,
      castName: latestRide.castName,
      destination: latestRide.destination,
      estimatedArrival: latestRide.estimatedArrival,
      actualArrival: now,
      memo: text(params.input.memo),
      affectsStatus: true
    };
  } else if (action === "DROPOFF") {
    if (currentStatus !== STATUSES.ARRIVED) throw new Error("現地到着後のみ女性降車できます。");
    if (!latestRide || !["送り", "事務所戻り"].includes(latestRide.type ?? "")) throw new Error("送りまたは事務所戻りのみ女性降車できます。");
    if (!latestRide.castName) throw new Error("キャスト名がないため女性降車できません。");
    data = {
      ...base,
      status: STATUSES.DROPPED_OFF,
      type: latestRide.type,
      castName: latestRide.castName,
      destination: latestRide.destination,
      dropoffTime: now,
      memo: text(params.input.memo),
      affectsStatus: true
    };
  } else if (action === "WAIT_FIELD" || action === "WAIT_OFFICE") {
    ensureWorking(currentStatus);
    data = {
      ...base,
      status: action === "WAIT_FIELD" ? STATUSES.WAIT_FIELD : STATUSES.WAIT_OFFICE,
      waitPlace: action === "WAIT_FIELD" ? "現地" : "事務所",
      destination: action === "WAIT_FIELD" ? latestRide?.destination ?? null : null,
      castName: action === "WAIT_FIELD" ? latestRide?.castName ?? null : null,
      type: action === "WAIT_FIELD" ? latestRide?.type ?? null : null,
      estimatedArrival: null,
      memo: text(params.input.memo),
      affectsStatus: true
    };
  } else if (action === "MAIL_CONFIRM_SEND" || action === "MAIL_CONFIRM_PICKUP") {
    ensureWorking(currentStatus);
    data = { ...base, status: currentStatus, memo: text(params.input.memo), affectsStatus: false };
  } else if (action === "CLOCK_OUT") {
    ensureWorking(currentStatus);
    const dailyReport = text(params.input.dailyReport);
    if (!dailyReport) throw new Error("日報は必須です。");
    const clockInLog = await getLatestClockInLog(params.driver.id, businessDate);
    if (!clockInLog) throw new Error("出勤ログがありません。");
    if (params.driver.hourlyWage <= 0) throw new Error("時給が設定されていません。");
    const distance = params.input.distance === undefined || params.input.distance === "" ? null : Number(params.input.distance);
    if (params.driver.gasSettlementType === "SEPARATE") {
      if (distance === null || Number.isNaN(distance)) throw new Error("走行距離は必須です。");
      if (!params.driver.gasRate) throw new Error("ガス単価が設定されていません。");
    }
    const settlement = calculateClockOutSettlement({ driver: params.driver, clockInLog, clockOutTime: now, distance });
    data = {
      ...base,
      status: STATUSES.CLOCKED_OUT,
      clockOutTime: now,
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
      memo: text(params.input.memo),
      affectsStatus: true
    };
  } else {
    throw new Error("未対応の操作です。");
  }

  if (!shouldAlwaysSave(action, params.actor) && latestStatusLogMatches(await getLatestStatusLog(params.driver.id, businessDate), data)) {
    return null;
  }

  const log = await prisma.driverLog.create({ data });
  const updated = await prisma.driverLog.update({
    where: { id: log.id },
    data: {
      discordSent: false,
      discordSentAt: null,
      discordWebhookType: webhookTypeForAction(log.action)
    }
  });

  const notification = await createBusinessNotificationForLog(updated);
  await enqueueDiscordJobForLog(updated, notification?.id ?? null);

  return updated;
}

function ensureWorking(status: string) {
  if (status === STATUSES.NOT_WORKING || status === STATUSES.CLOCKED_OUT) throw new Error("出勤中のみ操作できます。");
}

function text(value: unknown) {
  const string = typeof value === "string" ? value.trim() : "";
  return string || null;
}

function locationData(input: Record<string, unknown>): Pick<Prisma.DriverLogCreateInput, "latitude" | "longitude" | "accuracy" | "locationCapturedAt"> {
  const latitude = numberOrNull(input.latitude);
  const longitude = numberOrNull(input.longitude);
  if (latitude === null || longitude === null) return {};
  return {
    latitude,
    longitude,
    accuracy: numberOrNull(input.accuracy),
    locationCapturedAt: dateOrNow(input.capturedAt)
  };
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOrNow(value: unknown) {
  if (typeof value !== "string" || !value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function shouldAlwaysSave(action: Action, actor: Actor) {
  return actor.userType === "ADMIN" || ["MAIL_CONFIRM_SEND", "MAIL_CONFIRM_PICKUP", "CLOCK_OUT", "CLOCK_IN"].includes(action);
}

function latestStatusLogMatches(latest: Awaited<ReturnType<typeof getLatestStatusLog>>, data: Prisma.DriverLogCreateInput) {
  if (!latest) return false;
  return (
    latest.action === data.action &&
    latest.status === data.status &&
    nullish(latest.type) === nullish(data.type) &&
    nullish(latest.castName) === nullish(data.castName) &&
    nullish(latest.destination) === nullish(data.destination) &&
    nullish(latest.memo) === nullish(data.memo) &&
    nullish(latest.waitPlace) === nullish(data.waitPlace)
  );
}

function nullish(value: unknown) {
  return value ?? null;
}
