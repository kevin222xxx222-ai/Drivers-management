import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { getLatestClockInLog } from "@/lib/driver-service";
import { calculateClockOutSettlement } from "@/lib/settlement";
import { getBusinessDate } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const user = await requireDriver();
    const url = new URL(request.url);
    const distanceParam = url.searchParams.get("distance");
    const distance = distanceParam ? Number(distanceParam) : null;
    const businessDate = getBusinessDate();
    const clockInLog = await getLatestClockInLog(user.driver.id, businessDate);
    if (!clockInLog) return NextResponse.json({ error: "出勤ログがありません。" }, { status: 400 });
    return NextResponse.json(calculateClockOutSettlement({ driver: user.driver, clockInLog, distance }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "精算見込みを取得できません。" }, { status: 500 });
  }
}
