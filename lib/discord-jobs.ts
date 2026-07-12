import { Prisma } from "@prisma/client";
import { buildDiscordPayloadForLog, WebhookType, webhookTypeForAction } from "./discord";
import { prisma } from "./prisma";

type LogForDiscord = Parameters<typeof buildDiscordPayloadForLog>[0];

export async function enqueueDiscordJobForLog(log: LogForDiscord, notificationId?: string | null) {
  const webhookType = webhookTypeForAction(log.action);
  const payload = buildDiscordPayloadForLog(log) as Prisma.InputJsonValue;

  await createDiscordJobOnce({
    notificationId: notificationId ?? null,
    eventLogId: log.id,
    webhookType,
    payload
  });

  return webhookType;
}

export async function enqueueDiscordJobForNotification(input: {
  notificationId: string;
  webhookType: WebhookType;
  payload: Prisma.InputJsonValue;
}) {
  return createDiscordJobOnce({
    notificationId: input.notificationId,
    eventLogId: null,
    webhookType: input.webhookType,
    payload: input.payload
  });
}

export function isWebhookType(value: string): value is WebhookType {
  return value === "ATTENDANCE" || value === "LEAVE" || value === "NOTICE";
}

async function createDiscordJobOnce(input: {
  notificationId: string | null;
  eventLogId: string | null;
  webhookType: WebhookType;
  payload: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.discordJob.create({ data: input });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
