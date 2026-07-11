import { isWebhookType } from "../lib/discord-jobs";
import { sendDiscordPayload } from "../lib/discord";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TYPES, upsertLogNotification } from "../lib/notifications";
import { prisma } from "../lib/prisma";

const POLL_MS = Number(process.env.DISCORD_WORKER_POLL_MS ?? 1500);
const BATCH_SIZE = Number(process.env.DISCORD_WORKER_BATCH_SIZE ?? 10);
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const retryScheduleMs = [30_000, 120_000, 300_000, 900_000];
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.log("discord-worker started");
  while (!stopping) {
    const processed = await tick().catch((error) => {
      console.error("discord-worker tick failed", safeError(error));
      return 0;
    });
    await sleep(processed > 0 ? POLL_MS : Math.min(POLL_MS * 3, 5000));
  }
  await prisma.$disconnect();
  console.log("discord-worker stopped");
}

async function tick() {
  await releaseStaleProcessingJobs();
  const jobs = await claimJobs(BATCH_SIZE);
  for (const job of jobs) {
    await processJob(job);
  }
  return jobs.length;
}

async function releaseStaleProcessingJobs() {
  await prisma.discordJob.updateMany({
    where: {
      status: "PROCESSING",
      lockedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) }
    },
    data: {
      status: "PENDING",
      lockedAt: null
    }
  });
}

async function claimJobs(limit: number) {
  const candidates = await prisma.discordJob.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: new Date() }
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit
  });

  const claimed: typeof candidates = [];
  for (const job of candidates) {
    const result = await prisma.discordJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", lockedAt: new Date() }
    });
    if (result.count === 1) {
      const fresh = await prisma.discordJob.findUnique({ where: { id: job.id } });
      if (fresh) claimed.push(fresh);
    }
  }
  return claimed;
}

async function processJob(job: Awaited<ReturnType<typeof claimJobs>>[number]) {
  if (!isWebhookType(job.webhookType)) {
    await failPermanently(job, "Webhook種別が不正です。");
    return;
  }

  const startedAt = Date.now();
  const result = await sendDiscordPayload(job.webhookType, job.payload);
  if (result.sent) {
    const now = new Date();
    await prisma.$transaction([
      prisma.discordJob.update({
        where: { id: job.id },
        data: { status: "SENT", sentAt: now, lockedAt: null, lastError: null }
      }),
      ...(job.eventLogId ? [
        prisma.driverLog.update({
          where: { id: job.eventLogId },
          data: { discordSent: true, discordSentAt: now, discordWebhookType: job.webhookType }
        })
      ] : [])
    ]);
    performanceLog("discord_job_sent", { jobId: job.id, elapsedMs: Date.now() - startedAt });
    return;
  }

  const attemptCount = job.attemptCount + 1;
  const lastError = safeError(result.error ?? "Discord送信に失敗しました。");
  if (attemptCount >= job.maxAttempts) {
    await failPermanently(job, lastError, attemptCount);
    return;
  }

  const retryAfterMs = result.retryAfterMs ?? retryScheduleMs[Math.min(attemptCount - 1, retryScheduleMs.length - 1)];
  await prisma.discordJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      attemptCount,
      lockedAt: null,
      nextAttemptAt: new Date(Date.now() + retryAfterMs),
      lastError
    }
  });
}

async function failPermanently(job: { id: string; eventLogId: string | null; attemptCount: number; maxAttempts: number }, error: string, attemptCount = job.attemptCount + 1) {
  await prisma.discordJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      attemptCount,
      failedAt: new Date(),
      lockedAt: null,
      lastError: error
    }
  });

  if (!job.eventLogId) return;
  const log = await prisma.driverLog.findUnique({ where: { id: job.eventLogId } });
  if (!log) return;
  await upsertLogNotification({
    type: NOTIFICATION_TYPES.DISCORD_FAILED,
    category: NOTIFICATION_CATEGORIES.SYSTEM,
    severity: "CRITICAL",
    title: "Discord送信失敗",
    message: `${log.driverName} / ${log.action}`,
    driverId: log.driverId,
    relatedLogId: log.id
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error ?? "不明なエラー").slice(0, 500);
}

function performanceLog(event: string, data: Record<string, unknown>) {
  if (process.env.PERFORMANCE_LOGGING !== "true") return;
  console.log(JSON.stringify({ event, ...data }));
}

main().catch(async (error) => {
  console.error("discord-worker fatal", safeError(error));
  await prisma.$disconnect();
  process.exit(1);
});
