import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSystemErrorNotification, getNotificationSummary, notificationWhereFromSearchParams } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const where = notificationWhereFromSearchParams(url.searchParams);
    const summary = await getNotificationSummary();
    const notifications = await prisma.notification.findMany({
      where,
      include: { driver: { select: { id: true, driverName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return NextResponse.json({
      notifications,
      unreadCount: summary.systemUnreadCount,
      systemUnreadCount: summary.systemUnreadCount,
      businessUnreadCount: summary.businessUnreadCount,
      warningSummary: summary.warningSummary
    });
  } catch (error) {
    if (error instanceof Response) return error;
    await createSystemErrorNotification("通知取得", error);
    return NextResponse.json({ error: "通知を取得できません。" }, { status: 500 });
  }
}
