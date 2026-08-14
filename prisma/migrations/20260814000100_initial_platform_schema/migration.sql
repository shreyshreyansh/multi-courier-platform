-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED', 'RECONCILIATION_REQUIRED');

-- CreateEnum
CREATE TYPE "CourierOperation" AS ENUM ('DISPATCH', 'TRACK', 'CANCEL');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACCEPTED', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_id" TEXT NOT NULL,
    "courier_partner" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "command" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider_shipment_id" TEXT,
    "awb" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "operation" "CourierOperation" NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "request_metadata" JSONB,
    "response_metadata" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACCEPTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_items" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "disposition" TEXT,
    "admission_error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_id_key" ON "orders"("order_id");

-- CreateIndex
CREATE INDEX "orders_courier_partner_status_idx" ON "orders"("courier_partner", "status");

-- CreateIndex
CREATE INDEX "courier_attempts_order_id_created_at_idx" ON "courier_attempts"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "tracking_events_order_id_occurred_at_idx" ON "tracking_events"("order_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_events_order_id_fingerprint_key" ON "tracking_events"("order_id", "fingerprint");

-- CreateIndex
CREATE INDEX "batch_items_order_id_idx" ON "batch_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_items_batch_id_order_id_key" ON "batch_items"("batch_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupe_key_key" ON "outbox_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "courier_attempts" ADD CONSTRAINT "courier_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
