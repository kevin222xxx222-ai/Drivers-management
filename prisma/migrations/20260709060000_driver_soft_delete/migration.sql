ALTER TABLE "drivers"
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_admin_id" UUID;

CREATE INDEX "drivers_deleted_at_is_active_display_order_driver_name_idx"
ON "drivers"("deleted_at", "is_active", "display_order", "driver_name");
