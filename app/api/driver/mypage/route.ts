import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { availableActions, getCurrentStatus, getLatestRideLog, getLatestStatusLog } from "@/lib/driver-service";
import { prisma } from "@/lib/prisma";
import { formatBusinessDate, getBusinessDate } from "@/lib/time";

export async function GET() {
  try {
    const user = await requireDriver();
    const businessDate = getBusinessDate();
    const [currentStatus, latestStatusLog, latestRideLog, todayLogs] = await Promise.all([
      getCurrentStatus(user.driver.id, businessDate),
      getLatestStatusLog(user.driver.id, businessDate),
      getLatestRideLog(user.driver.id, businessDate),
      prisma.driverLog.findMany({
        where: { driverId: user.driver.id, businessDate },
        orderBy: { datetime: "desc" }
      })
    ]);
    return NextResponse.json({
      driver: user.driver,
      businessDate: formatBusinessDate(businessDate),
      currentStatus,
      latestStatusLog,
      todayLogs,
      availableActions: availableActions(currentStatus, latestRideLog?.type)
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 500 });
  }
}
