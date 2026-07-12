CREATE TABLE "driver_status_corrections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "driver_id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "before_status" VARCHAR(50) NOT NULL,
  "after_status" VARCHAR(50) NOT NULL,
  "reason" TEXT NOT NULL,
  "related_log_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "driver_status_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_status_corrections_driver_id_created_at_idx"
ON "driver_status_corrections"("driver_id", "created_at");

CREATE INDEX "driver_status_corrections_admin_id_created_at_idx"
ON "driver_status_corrections"("admin_id", "created_at");

ALTER TABLE "driver_status_corrections"
ADD CONSTRAINT "driver_status_corrections_driver_id_fkey"
FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_status_corrections"
ADD CONSTRAINT "driver_status_corrections_admin_id_fkey"
FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_status_corrections"
ADD CONSTRAINT "driver_status_corrections_related_log_id_fkey"
FOREIGN KEY ("related_log_id") REFERENCES "driver_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
