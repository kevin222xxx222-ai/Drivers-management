import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const logIds = Array.isArray(body.logIds) ? body.logIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id)) : [];
    if (!logIds.length) return NextResponse.json({ error: "削除する履歴を選択してください。" }, { status: 400 });
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { relatedLogId: { in: logIds } } }),
      prisma.driverLogAudit.deleteMany({ where: { driverLogId: { in: logIds } } }),
      prisma.driverLog.deleteMany({ where: { id: { in: logIds } } })
    ]);
    return NextResponse.json({ success: true, deletedCount: logIds.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "履歴削除に失敗しました。" }, { status: 500 });
  }
}
