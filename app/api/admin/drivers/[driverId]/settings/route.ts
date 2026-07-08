import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export async function PATCH(request: Request, context: { params: { driverId: string } }) {
  try {
    await requireAdmin();
    const body = await request.json();
    const data: Record<string, unknown> = {
      driverName: String(body.driverName ?? "").trim(),
      hourlyWage: Number(body.hourlyWage ?? 0),
      gasSettlementType: String(body.gasSettlementType ?? "INCLUDED"),
      gasType: null,
      gasRate: body.gasRate ? Number(body.gasRate) : null,
      isActive: Boolean(body.isActive),
      displayOrder: Number(body.displayOrder ?? 0)
    };
    if (typeof body.pin === "string" && body.pin.trim()) data.pinHash = hashPassword(body.pin.trim());
    const driver = await prisma.driver.update({
      where: { id: context.params.driverId },
      data
    });
    return NextResponse.json({ success: true, driver });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ success: false, error: "設定更新に失敗しました。" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: { driverId: string } }) {
  try {
    await requireAdmin();
    const driver = await prisma.driver.update({
      where: { id: context.params.driverId },
      data: { isActive: false }
    });
    return NextResponse.json({ success: true, driver });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ success: false, error: "ドライバー削除に失敗しました。" }, { status: 400 });
  }
}
