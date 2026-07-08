-- CreateTable
CREATE TABLE "driver_log_audits" (
    "id" UUID NOT NULL,
    "driver_log_id" UUID NOT NULL,
    "before_json" JSONB NOT NULL,
    "after_json" JSONB NOT NULL,
    "edited_by_admin_id" UUID NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "driver_log_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_log_audits_driver_log_id_edited_at_idx" ON "driver_log_audits"("driver_log_id", "edited_at");

-- AddForeignKey
ALTER TABLE "driver_log_audits" ADD CONSTRAINT "driver_log_audits_driver_log_id_fkey" FOREIGN KEY ("driver_log_id") REFERENCES "driver_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
