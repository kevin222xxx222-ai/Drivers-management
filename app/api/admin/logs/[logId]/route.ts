import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: { logId: string } }) {
  try {
    await requireAdmin();
    const log = await prisma.driverLog.findUnique({
      where: { id: context.params.logId },
      include: { audits: { orderBy: { editedAt: "desc" } } }
    });
    if (!log) return NextResponse.json({ error: "ログが見つかりません。" }, { status: 404 });
    return NextResponse.json({ log });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "ログ詳細を取得できません。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: { logId: string } }) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const before = await prisma.driverLog.findUnique({ where: { id: context.params.logId } });
    if (!before) return NextResponse.json({ error: "ログが見つかりません。" }, { status: 404 });
    const allowed = [
      "status",
      "type",
      "castName",
      "destination",
      "estimatedArrival",
      "actualArrival",
      "dropoffTime",
      "memo",
      "dailyReport",
      "distance",
      "gasSubtotal",
      "totalPayment"
    ] as const;
    const data: Record<string, unknown> = {
      updatedByUserType: "ADMIN",
      updatedByUserId: user.admin.id
    };
    for (const key of allowed) {
      if (!(key in body)) continue;
      if (["estimatedArrival", "actualArrival", "dropoffTime"].includes(key)) {
        data[key] = body[key] ? new Date(body[key]) : null;
      } else if (["distance", "gasSubtotal", "totalPayment"].includes(key)) {
        data[key] = body[key] === "" || body[key] === null ? null : Number(body[key]);
      } else {
        data[key] = body[key] === "" ? null : body[key];
      }
    }
    const log = await prisma.driverLog.update({ where: { id: context.params.logId }, data });
    await prisma.driverLogAudit.create({
      data: {
        driverLogId: log.id,
        beforeJson: toJson(before),
        afterJson: toJson(log),
        editedByAdminId: user.admin.id,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null
      }
    });
    return NextResponse.json({ success: true, log });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ success: false, error: "ログ修正に失敗しました。" }, { status: 400 });
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
