import { describe, expect, it } from "vitest";

import type { CreateOrderCommand } from "../domain/order.types";
import { InMemoryOrderRepository } from "../infrastructure/in-memory-order.repository";
import { OrderService } from "./order.service";

const baseCommand: CreateOrderCommand = {
  orderId: "ORDER-1001",
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
  parcel: {
    weightGrams: 750,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  },
  invoice: {
    number: "INV-1001",
    amount: 1_299,
    currency: "INR",
  },
};

describe("OrderService", () => {
  it("accepts a normalized order once and schedules asynchronous dispatch", async () => {
    const dispatcher = new RecordingDispatcher();
    const service = new OrderService(new InMemoryOrderRepository(), dispatcher);

    const result = await service.create(baseCommand);

    expect(result).toMatchObject({
      disposition: "created",
      order: {
        orderId: "ORDER-1001",
        status: "PENDING",
        courierPartner: "mock",
      },
    });
    expect(dispatcher.orderIds).toEqual(["ORDER-1001"]);
  });

  it("replays the existing result without scheduling duplicate work for an identical request", async () => {
    const dispatcher = new RecordingDispatcher();
    const service = new OrderService(new InMemoryOrderRepository(), dispatcher);

    const first = await service.create(baseCommand);
    const second = await service.create({ ...baseCommand });

    expect(second).toMatchObject({
      disposition: "replayed",
      order: { id: first.order.id },
    });
    expect(dispatcher.orderIds).toEqual(["ORDER-1001"]);
  });

  it("rejects a reused order ID when the normalized request differs", async () => {
    const service = new OrderService(
      new InMemoryOrderRepository(),
      new RecordingDispatcher(),
    );

    await service.create(baseCommand);

    await expect(
      service.create({
        ...baseCommand,
        parcel: { ...baseCommand.parcel, weightGrams: 900 },
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      statusCode: 409,
    });
  });
});

class RecordingDispatcher {
  public readonly orderIds: string[] = [];

  public enqueueOrderDispatch(orderId: string): Promise<void> {
    this.orderIds.push(orderId);
    return Promise.resolve();
  }
}
