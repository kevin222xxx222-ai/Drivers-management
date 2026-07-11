import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { webhookTypeForAction } from "@/lib/discord";
import { enqueueDiscordJobForLog } from "@/lib/discord-jobs";
import { getCurrentStatus, getDriverPageState, getLatestClockInLog } from "@/lib/driver-service";
import { NOTIFICATION_TYPES, createBusinessNotificationForLog } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getBusinessDate, parseLocalDateTime } from "@/lib/time";

export async function PATCH(request: Request) {
  try {
    const user = await requireDriver();
    const body = await request.json();
    const scheduledClockOut = parseLocalDateTime(String(body.scheduledClockOut ?? ""));
    if (!scheduledClockOut || Number.isNaN(scheduledClockOut.getTime())) {
      return NextResponse.json({ error: "退勤予定日時が不正です。" }, { status: 400 });
    }

    const businessDate = getBusinessDate();
    const clockInLog = await getLatestClockInLog(user.driver.id, businessDate);
    if (!clockInLog) return NextResponse.json({ error: "出勤ログがありません。" }, { status: 404 });

    const currentStatus = await getCurrentStatus(user.driver.id, businessDate);
    const now = new Date();
    const oldScheduledClockOut = clockInLog.scheduledClockOut;

    const [, changeLog] = await prisma.$transaction([
      prisma.driverLog.update({
        where: { id: clockInLog.id },
        data: { scheduledClockOut }
      }),
      prisma.driverLog.create({
        data: {
          businessDate,
          datetime: now,
          driverId: user.driver.id,
          driverName: user.driver.driverName,
          action: "UPDATE_SCHEDULED_CLOCK_OUT",
          status: currentStatus,
          oldScheduledClockOut,
          newScheduledClockOut: scheduledClockOut,
          scheduledClockOut,
          affectsStatus: false,
          createdByUserType: "DRIVER",
          createdByUserId: user.driver.id
        }
      })
    ]);

    await prisma.notification.deleteMany({
      where: { type: NOTIFICATION_TYPES.CLOCK_OUT_OVERDUE, relatedLogId: clockInLog.id }
    });
    await prisma.driverLog.update({
      where: { id: changeLog.id },
      data: { discordWebhookType: webhookTypeForAction(changeLog.action), discordSent: false, discordSentAt: null }
    });
    const notification = await createBusinessNotificationForLog(changeLog);
    await enqueueDiscordJobForLog(changeLog, notification?.id ?? null);

    const state = await getDriverPageState(user.driver);
    return NextResponse.json({ success: true, scheduledClockOut, log: changeLog, state });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error instanceof Error ? error.message : "退勤予定日時を変更できません。" }, { status: 500 });
  }
}
