-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" VARCHAR(20) NOT NULL DEFAULT 'SYSTEM';

-- CreateIndex
CREATE INDEX "notifications_category_is_read_created_at_idx" ON "notifications"("category", "is_read", "created_at");
