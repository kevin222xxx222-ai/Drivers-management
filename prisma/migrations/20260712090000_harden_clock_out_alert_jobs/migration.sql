ALTER TABLE "driver_clock_out_alerts"
ADD COLUMN "notification_id" UUID;

CREATE UNIQUE INDEX "discord_jobs_notification_id_webhook_type_key"
ON "discord_jobs"("notification_id", "webhook_type");
