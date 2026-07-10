DELETE FROM "driver_clock_out_alerts";

DROP INDEX IF EXISTS "driver_clock_out_alerts_driver_id_business_date_phase_key";

ALTER TABLE "driver_clock_out_alerts"
ADD COLUMN "scheduled_clock_out" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "driver_clock_out_alerts_driver_id_business_date_scheduled_clock_out_phase_key"
ON "driver_clock_out_alerts"("driver_id", "business_date", "scheduled_clock_out", "phase");
