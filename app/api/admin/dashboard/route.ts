import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { latestDriverLogOrder } from "@/lib/driver-service";
import { prisma } from "@/lib/prisma";
import { formatBusinessDate, getBusinessDate } from "@/lib/time";
import { createSystemErrorNotification, getNotificationSummary } from "@/lib/notifications";

const WAITING_STATUSES = ["出勤中", "事務所待機"];
const ACTIVE_RIDE_STATUSES = ["送り中", "迎え中", "戻り中", "その他", "現地到着", "女性降車済み", "現地待機"];

export async function GET() {
  try {
    await requireAdmin();
    const businessDate = getBusinessDate();
    const [drivers, notificationSummary] = await Promise.all([
      prisma.driver.findMany({ where: { deletedAt: null }, orderBy: [{ displayOrder: "asc" }, { driverName: "asc" }] }),
      getNotificationSummary()
    ]);
    const latestLogs = await Promise.all(
      drivers.map(async (driver) => ({
        driver,
        latestLog: await prisma.driverLog.findFirst({
          where: { driverId: driver.id, businessDate, affectsStatus: true },
          orderBy: latestDriverLogOrder
        }),
        clockInLog: await prisma.driverLog.findFirst({
          where: { driverId: driver.id, businessDate, action: "CLOCK_IN", affectsStatus: true },
          orderBy: latestDriverLogOrder
        })
      }))
    );
    const currentStatuses = latestLogs.map(({ driver, latestLog }) => ({
      driverId: driver.id,
      status: latestLog?.status ?? "未出勤",
      latestLog
    }));
    const waitingDrivers = latestLogs
      .filter(({ latestLog }) => latestLog && WAITING_STATUSES.includes(latestLog.status))
      .map(({ driver, latestLog, clockInLog }) => ({
        driverId: driver.id,
        driverName: driver.driverName,
        status: latestLog!.status,
        scheduledClockOut: clockInLog?.scheduledClockOut ?? null,
        lastUpdatedAt: latestLog!.datetime,
        memo: latestLog!.memo
      }));
    const activeRideDrivers = latestLogs
      .filter(({ latestLog }) => latestLog && ACTIVE_RIDE_STATUSES.includes(latestLog.status))
      .map(({ driver, latestLog, clockInLog }) => ({
        driverId: driver.id,
        driverName: driver.driverName,
        status: latestLog!.status,
        scheduledClockOut: clockInLog?.scheduledClockOut ?? null,
        type: latestLog!.type,
        castName: latestLog!.castName,
        destination: latestLog!.destination,
        estimatedArrival: latestLog!.estimatedArrival,
        actualArrival: latestLog!.actualArrival,
        rideState: getRideState(latestLog!.status, latestLog!.estimatedArrival, latestLog!.actualArrival),
        lastUpdatedAt: latestLog!.datetime,
        memo: latestLog!.memo
      }))
      .sort((a, b) => {
        if (a.estimatedArrival && b.estimatedArrival) return a.estimatedArrival.getTime() - b.estimatedArrival.getTime();
        if (a.estimatedArrival) return -1;
        if (b.estimatedArrival) return 1;
        return a.lastUpdatedAt.getTime() - b.lastUpdatedAt.getTime();
      });
    const todayLogs = await prisma.driverLog.findMany({ where: { businessDate }, orderBy: latestDriverLogOrder, take: 100 });
    return NextResponse.json({
      businessDate: formatBusinessDate(businessDate),
      summary: {
        workingWaitingCount: waitingDrivers.length,
        activeRideCount: activeRideDrivers.length
      },
      waitingDrivers,
      activeRideDrivers,
      lastUpdatedAt: new Date(),
      drivers,
      currentStatuses,
      todayLogs,
      unreadNotificationCount: notificationSummary.unreadCount,
      warningSummary: notificationSummary.warningSummary
    });
  } catch (error) {
    if (error instanceof Response) return error;
    await createSystemErrorNotification("管理ダッシュボード取得", error);
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}

function getRideState(status: string, estimatedArrival: Date | null, actualArrival: Date | null) {
  if (!estimatedArrival) return status === "現地到着" || status === "女性降車済み" ? "到着済み" : "正常";
  if (actualArrival) {
    if (actualArrival.getTime() < estimatedArrival.getTime()) return "早着";
    if (actualArrival.getTime() > estimatedArrival.getTime()) return "遅延";
    return "到着済み";
  }
  if (status === "現地到着" || status === "女性降車済み") return "到着済み";
  return Date.now() > estimatedArrival.getTime() ? "遅延" : "正常";
}
