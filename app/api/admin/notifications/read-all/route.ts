import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_CATEGORIES, createSystemErrorNotification } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const category = String(body.category ?? "");
    if (category !== NOTIFICATION_CATEGORIES.BUSINESS && category !== NOTIFICATION_CATEGORIES.SYSTEM) {
      return NextResponse.json({ error: "通知カテゴリが正しくありません。" }, { status: 400 });
    }
    const result = await prisma.notification.updateMany({
      where: { category, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    if (error instanceof Response) return error;
    await createSystemErrorNotification("通知一括既読", error);
    return NextResponse.json({ error: "通知の一括既読に失敗しました。" }, { status: 500 });
  }
}
