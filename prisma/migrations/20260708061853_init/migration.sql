-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "driver_name" VARCHAR(100) NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'DRIVER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "hourly_wage" INTEGER NOT NULL DEFAULT 0,
    "gas_settlement_type" VARCHAR(20) NOT NULL DEFAULT 'INCLUDED',
    "gas_type" VARCHAR(50),
    "gas_rate" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "admin_id" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_type" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logout_at" TIMESTAMP(3),
    "last_access_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_logs" (
    "id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "datetime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driver_id" UUID NOT NULL,
    "driver_name" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "type" VARCHAR(50),
    "cast_name" VARCHAR(100),
    "destination" TEXT,
    "scheduled_clock_out" TIMESTAMP(3),
    "travel_minutes" INTEGER,
    "estimated_arrival" TIMESTAMP(3),
    "actual_arrival" TIMESTAMP(3),
    "dropoff_time" TIMESTAMP(3),
    "clock_out_time" TIMESTAMP(3),
    "rounded_clock_out_time" TIMESTAMP(3),
    "work_hours" DECIMAL(5,2),
    "hourly_wage" INTEGER,
    "wage_subtotal" INTEGER,
    "gas_settlement_type" VARCHAR(20),
    "gas_type" VARCHAR(50),
    "gas_rate" DECIMAL(10,2),
    "distance" DECIMAL(10,2),
    "gas_subtotal" INTEGER,
    "total_payment" INTEGER,
    "daily_report" TEXT,
    "wait_place" VARCHAR(50),
    "memo" TEXT,
    "affects_status" BOOLEAN NOT NULL DEFAULT true,
    "discord_sent" BOOLEAN NOT NULL DEFAULT false,
    "discord_sent_at" TIMESTAMP(3),
    "discord_webhook_type" VARCHAR(50),
    "created_by_user_type" VARCHAR(20),
    "created_by_user_id" UUID,
    "updated_by_user_type" VARCHAR(20),
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_clock_out_alerts" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "phase" VARCHAR(20) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_clock_out_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_driver_name_key" ON "drivers"("driver_name");

-- CreateIndex
CREATE UNIQUE INDEX "admins_admin_id_key" ON "admins"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_hash_key" ON "sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "driver_logs_driver_id_business_date_affects_status_datetime_idx" ON "driver_logs"("driver_id", "business_date", "affects_status", "datetime");

-- CreateIndex
CREATE UNIQUE INDEX "driver_clock_out_alerts_driver_id_business_date_phase_key" ON "driver_clock_out_alerts"("driver_id", "business_date", "phase");

-- AddForeignKey
ALTER TABLE "driver_logs" ADD CONSTRAINT "driver_logs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
