CREATE TABLE "driver_work_time_corrections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "driver_id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "correction_type" VARCHAR(50) NOT NULL,
  "business_date_before" DATE,
  "business_date_after" DATE,
  "clock_in_before" TIMESTAMP(3),
  "clock_in_after" TIMESTAMP(3),
  "clock_out_before" TIMESTAMP(3),
  "clock_out_after" TIMESTAMP(3),
  "work_hours_before" DECIMAL(5,2),
  "work_hours_after" DECIMAL(5,2),
  "wage_subtotal_before" INTEGER,
  "wage_subtotal_after" INTEGER,
  "gas_subtotal_before" INTEGER,
  "gas_subtotal_after" INTEGER,
  "total_payment_before" INTEGER,
  "total_payment_after" INTEGER,
  "reason" TEXT NOT NULL,
  "related_clock_in_log_id" UUID,
  "related_clock_out_log_id" UUID,
  "related_admin_log_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "driver_work_time_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_work_time_corrections_driver_id_created_at_idx" ON "driver_work_time_corrections"("driver_id", "created_at");
CREATE INDEX "driver_work_time_corrections_admin_id_created_at_idx" ON "driver_work_time_corrections"("admin_id", "created_at");

ALTER TABLE "driver_work_time_corrections" ADD CONSTRAINT "driver_work_time_corrections_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_work_time_corrections" ADD CONSTRAINT "driver_work_time_corrections_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
