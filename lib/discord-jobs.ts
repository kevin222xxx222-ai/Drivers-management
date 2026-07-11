import { Prisma } from "@prisma/client";
import { buildDiscordPayloadForLog, WebhookType, webhookTypeForAction } from "./discord";
import { prisma } from "./prisma";

type LogForDiscord = Parameters<typeof buildDiscordPayloadForLog>[0];

export async function enqueueDiscordJobForLog(log: LogForDiscord, notificationId?: string | null) {
  const webhookType = webhookTypeForAction(log.action);
  const payload = buildDiscordPayloadForLog(log) as Prisma.InputJsonValue;

  await prisma.discordJob.create({
    data: {
      notificationId: notificationId ?? null,
      eventLogId: log.id,
      webhookType,
      payload
    }
  });

  return webhookType;
}

export function isWebhookType(value: string): value is WebhookType {
  return value === "ATTENDANCE" || value === "LEAVE" || value === "NOTICE";
}
