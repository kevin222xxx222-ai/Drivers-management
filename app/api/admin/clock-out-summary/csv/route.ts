import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getBusinessDate } from "@/lib/time";
import { buildClockOutSummary } from "@/lib/clock-out-summary";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const businessDateFrom = parseBusinessDate(url.searchParams.get("businessDateFrom")) ?? getBusinessDate();
    const businessDateTo = parseBusinessDate(url.searchParams.get("businessDateTo")) ?? businessDateFrom;
    const driverId = url.searchParams.get("driverId") || undefined;
    const result = await buildClockOutSummary({ businessDateFrom, businessDateTo, driverId });
    const rows = [
      ["営業日", "ドライバー名", "出勤時刻", "退勤時刻", "丸め後退勤時刻", "稼働時間", "時給", "時給小計", "走行距離", "ガス単価", "ガス代小計", "合計報酬", "業務報告", "退勤登録時刻"],
      ...result.items.map((item) => [
        item.businessDate,
        item.driverName,
        formatDateTime(item.clockInTime),
        formatDateTime(item.clockOutTime),
        formatDateTime(item.roundedClockOutTime),
        String(item.workHours),
        String(item.hourlyWage),
        String(item.wageSubtotal),
        item.distance === null ? "" : String(item.distance),
        item.gasRate === null ? "" : String(item.gasRate),
        String(item.gasSubtotal),
        String(item.totalPayment),
        item.dailyReport,
        formatDateTime(item.createdAt)
      ])
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="clock-out-summary.csv"`
      }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "CSVを出力できません。" }, { status: 500 });
  }
}

function parseBusinessDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: Date | string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function csvCell(value: string) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
