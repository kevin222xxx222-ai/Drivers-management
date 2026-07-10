import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const drivers = await prisma.driver.findMany({ where: { deletedAt: null }, orderBy: [{ displayOrder: "asc" }, { driverName: "asc" }] });
    const settings = await Promise.all(
      drivers.map(async (driver) => {
        const lastClockIn = await prisma.driverLog.findFirst({
          where: { driverId: driver.id, action: "CLOCK_IN" },
          orderBy: { datetime: "desc" }
        });
        return { ...driver, lastClockInAt: lastClockIn?.datetime ?? null };
      })
    );
    return NextResponse.json({ drivers: settings });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "ドライバー設定を取得できません。" }, { status: 500 });
  }
}
