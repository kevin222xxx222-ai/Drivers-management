import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { notificationId: string } }) {
  try {
    await requireAdmin();
    const body = await request.json();
    const isRead = Boolean(body.isRead);
    const notification = await prisma.notification.update({
      where: { id: params.notificationId },
      data: {
        isRead,
        readAt: isRead ? new Date() : null
      }
    });
    return NextResponse.json({ success: true, notification });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "通知の更新に失敗しました。" }, { status: 400 });
  }
}
