import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../common/application-error";
import type { CreateOrderCommand, StoredOrder } from "../domain/order.types";
import { BatchService } from "./batch.service";

const commands: readonly CreateOrderCommand[] = [
  createCommand("ORDER-BATCH-1001"),
  createCommand("ORDER-BATCH-1002"),
];

describe("BatchService", () => {
  it("accepts orders without waiting for courier results and returns item-level admission outcomes", async () => {
    const orders = new RecordingOrderGateway();
    const service = new BatchService(orders);

    const batch = await service.create(commands);

    expect(batch).toMatchObject({
      status: "ACCEPTED",
      totalCount: 2,
      acceptedCount: 2,
      failedCount: 0,
      items: [
        {
          orderId: "ORDER-BATCH-1001",
          disposition: "created",
          status: "PENDING",
        },
        {
          orderId: "ORDER-BATCH-1002",
          disposition: "created",
          status: "PENDING",
        },
      ],
    });
    expect(orders.createCalls).toEqual([
      "ORDER-BATCH-1001",
      "ORDER-BATCH-1002",
    ]);
  });

  it("retains an item-level admission failure instead of hiding partial acceptance", async () => {
    const orders = new RecordingOrderGateway(["ORDER-BATCH-1002"]);
    const service = new BatchService(orders);

    const batch = await service.create(commands);

    expect(batch).toMatchObject({
      totalCount: 2,
      acceptedCount: 1,
      failedCount: 1,
      status: "PARTIAL_FAILURE",
      items: [
        { orderId: "ORDER-BATCH-1001", disposition: "created" },
        {
          orderId: "ORDER-BATCH-1002",
          error: {
            code: "IDEMPOTENCY_CONFLICT",
            message: "Order already exists with a different payload.",
          },
        },
      ],
    });
  });

  it("projects the current lifecycle state when a batch is queried", async () => {
    const orders = new RecordingOrderGateway();
    const service = new BatchService(orders);
    const created = await service.create(commands);
    orders.statusByOrderId.set("ORDER-BATCH-1001", "CREATED");
    orders.statusByOrderId.set("ORDER-BATCH-1002", "FAILED");

    const batch = await service.get(created.batchId);

    expect(batch).toMatchObject({
      batchId: created.batchId,
      status: "PARTIAL_FAILURE",
      completedCount: 2,
      failedCount: 1,
      items: [
        { orderId: "ORDER-BATCH-1001", status: "CREATED" },
        { orderId: "ORDER-BATCH-1002", status: "FAILED" },
      ],
    });
  });

  it("returns a normalized not-found error for an unknown batch", async () => {
    const service = new BatchService(new RecordingOrderGateway());

    await expect(service.get("missing-batch")).rejects.toMatchObject({
      code: "BATCH_NOT_FOUND",
      statusCode: 404,
    });
  });
});

class RecordingOrderGateway {
  public readonly createCalls: string[] = [];
  public readonly statusByOrderId = new Map<string, StoredOrder["status"]>();

  public constructor(
    private readonly conflictingOrderIds: readonly string[] = [],
  ) {}

  public create(command: CreateOrderCommand) {
    this.createCalls.push(command.orderId);

    if (this.conflictingOrderIds.includes(command.orderId)) {
      return Promise.reject(
        new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          409,
          "Order already exists with a different payload.",
        ),
      );
    }

    this.statusByOrderId.set(command.orderId, "PENDING");
    return Promise.resolve({
      disposition: "created" as const,
      order: toStoredOrder(command, "PENDING"),
    });
  }

  public get(orderId: string): Promise<StoredOrder> {
    const command = commands.find((candidate) => candidate.orderId === orderId);

    if (command === undefined) {
      return Promise.reject(
        new ApplicationError("ORDER_NOT_FOUND", 404, "Order was not found."),
      );
    }

    return Promise.resolve(
      toStoredOrder(command, this.statusByOrderId.get(orderId) ?? "PENDING"),
    );
  }
}

function createCommand(orderId: string): CreateOrderCommand {
  return {
    orderId,
    courierPartner: "mock",
    serviceType: "FORWARD",
    paymentMode: "PREPAID",
    shipper: {
      name: "Acme Warehouse",
      phone: "+919900000001",
      addressLine1: "1 Market Street",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN",
    },
    consignee: {
      name: "Ada Lovelace",
      phone: "+919900000002",
      addressLine1: "42 Computing Lane",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
      country: "IN",
    },
    parcel: { weightGrams: 750, lengthCm: 20, widthCm: 15, heightCm: 10 },
    invoice: { number: "INV-BATCH-1001", amount: 1_299, currency: "INR" },
  };
}

function toStoredOrder(
  command: CreateOrderCommand,
  status: StoredOrder["status"],
): StoredOrder {
  const now = new Date("2026-08-14T00:00:00.000Z");

  return {
    id: command.orderId,
    orderId: command.orderId,
    courierPartner: command.courierPartner,
    serviceType: command.serviceType,
    paymentMode: command.paymentMode,
    requestFingerprint: "test-fingerprint",
    command,
    status,
    createdAt: now,
    updatedAt: now,
  };
}
