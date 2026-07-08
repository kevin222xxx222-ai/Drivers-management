import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createDriverLog } from "@/lib/driver-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: { driverId: string } }) {
  try {
    const user = await requireAdmin();
    const driver = await prisma.driver.findUnique({ where: { id: context.params.driverId } });
    if (!driver) return NextResponse.json({ error: "ドライバーが見つかりません。" }, { status: 404 });
    const input = await request.json();
    const log = await createDriverLog({
      driver,
      actor: { userType: "ADMIN", userId: user.admin.id },
      input
    });
    return NextResponse.json({ success: true, log });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "保存に失敗しました。" }, { status: 400 });
  }
}
