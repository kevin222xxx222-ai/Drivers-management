ALTER TABLE "driver_logs"
ADD COLUMN "old_scheduled_clock_out" TIMESTAMP(3),
ADD COLUMN "new_scheduled_clock_out" TIMESTAMP(3);
