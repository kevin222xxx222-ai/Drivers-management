CREATE TABLE "discord_jobs" (
  "id" TEXT NOT NULL,
  "notification_id" UUID,
  "event_log_id" UUID,
  "webhook_type" VARCHAR(20) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "discord_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discord_jobs_status_next_attempt_at_idx" ON "discord_jobs"("status", "next_attempt_at");
