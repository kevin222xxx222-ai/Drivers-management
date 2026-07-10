import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { latestDriverLogOrder } from "@/lib/driver-service";
import { prisma } from "@/lib/prisma";
import { getBusinessDate } from "@/lib/time";

export async function GET() {
  try {
    await requireAdmin();
    const businessDate = getBusinessDate();
    const logs = await prisma.driverLog.findMany({
      where: { businessDate, action: "CLOCK_OUT" },
      orderBy: latestDriverLogOrder
    });
    return NextResponse.json({ businessDate: businessDate.toISOString().slice(0, 10), logs });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "退勤一覧を取得できません。" }, { status: 500 });
  }
}
