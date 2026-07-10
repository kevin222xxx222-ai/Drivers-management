import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildClockOutSummary } from "@/lib/clock-out-summary";
import { getBusinessDate } from "@/lib/time";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const businessDateFrom = parseBusinessDate(url.searchParams.get("businessDateFrom")) ?? getBusinessDate();
    const businessDateTo = parseBusinessDate(url.searchParams.get("businessDateTo")) ?? businessDateFrom;
    const driverId = url.searchParams.get("driverId") || undefined;
    const result = await buildClockOutSummary({ businessDateFrom, businessDateTo, driverId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "退勤者集計を取得できません。" }, { status: 500 });
  }
}

function parseBusinessDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
