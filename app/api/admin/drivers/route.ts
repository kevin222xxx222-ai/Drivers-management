import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const driverName = String(body.driverName ?? "").trim();
    const pin = String(body.pin ?? "").trim();
    if (!driverName || !pin) return NextResponse.json({ error: "ドライバー名とPINは必須です。" }, { status: 400 });
    const driver = await prisma.driver.create({
      data: {
        driverName,
        pinHash: hashPassword(pin),
        hourlyWage: Number(body.hourlyWage ?? 0),
        gasSettlementType: String(body.gasSettlementType ?? "INCLUDED"),
        gasType: null,
        gasRate: body.gasRate ? Number(body.gasRate) : null,
        displayOrder: Number(body.displayOrder ?? 0),
        isActive: body.isActive === undefined ? true : Boolean(body.isActive)
      }
    });
    return NextResponse.json({ success: true, driver });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ success: false, error: "ドライバー追加に失敗しました。" }, { status: 400 });
  }
}
