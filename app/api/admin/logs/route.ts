import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { latestDriverLogOrder } from "@/lib/driver-service";
import { prisma } from "@/lib/prisma";
import { createSystemErrorNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const where: Prisma.DriverLogWhereInput = {};

    const businessDateFrom = url.searchParams.get("businessDateFrom");
    const businessDateTo = url.searchParams.get("businessDateTo");
    if (businessDateFrom || businessDateTo) {
      where.businessDate = {
        ...(businessDateFrom ? { gte: new Date(`${businessDateFrom}T00:00:00.000Z`) } : {}),
        ...(businessDateTo ? { lte: new Date(`${businessDateTo}T00:00:00.000Z`) } : {})
      };
    }
    for (const key of ["driverId", "status", "type", "action"] as const) {
      const value = url.searchParams.get(key);
      if (value) where[key] = value;
    }
    const castName = url.searchParams.get("castName");
    const destination = url.searchParams.get("destination");
    if (castName) where.castName = { contains: castName };
    if (destination) where.destination = { contains: destination };

    const [logs, total] = await Promise.all([
      prisma.driverLog.findMany({
        where,
        orderBy: latestDriverLogOrder,
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.driverLog.count({ where })
    ]);
    return NextResponse.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    if (error instanceof Response) return error;
    await createSystemErrorNotification("全履歴検索", error);
    return NextResponse.json({ error: "検索に失敗しました。" }, { status: 500 });
  }
}
