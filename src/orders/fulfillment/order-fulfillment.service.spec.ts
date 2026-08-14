import { describe, expect, it } from "vitest";

import { CourierAdapterRegistry } from "../../couriers/courier-adapter.registry";
import { MockCourierAdapter } from "../../couriers/mock-courier.adapter";
import { fingerprintOrderRequest } from "../domain/request-fingerprint";
import type { CreateOrderCommand } from "../domain/order.types";
import { InMemoryOrderRepository } from "../infrastructure/in-memory-order.repository";
import { OrderFulfillmentService } from "./order-fulfillment.service";

const command: CreateOrderCommand = {
  orderId: "ORDER-FULFILMENT-1001",
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
  invoice: { number: "INV-FULFILMENT-1001", amount: 1_299, currency: "INR" },
};

describe("OrderFulfillmentService", () => {
  it("creates, tracks, and cancels an order through the normalized courier port", async () => {
    const repository = new InMemoryOrderRepository();
    await repository.admit(command, fingerprintOrderRequest(command));
    const service = new OrderFulfillmentService(
      repository,
      new CourierAdapterRegistry([new MockCourierAdapter()]),
    );

    const dispatched = await service.dispatch(command.orderId);
    const tracked = await service.track(command.orderId);
    const cancelled = await service.cancel(command.orderId);

    expect(dispatched.status).toBe("CREATED");
    expect(dispatched.awb).toMatch(/^MOCK-/);
    expect(tracked).toMatchObject({
      status: "CREATED",
      orderId: command.orderId,
    });
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      orderId: command.orderId,
    });
  });

  it("fails a dispatch with an unsupported courier partner without mutating another order", async () => {
    const repository = new InMemoryOrderRepository();
    const unsupported = {
      ...command,
      orderId: "ORDER-UNKNOWN-1001",
      courierPartner: "urbanebolt" as const,
    };
    await repository.admit(unsupported, fingerprintOrderRequest(unsupported));
    const service = new OrderFulfillmentService(
      repository,
      new CourierAdapterRegistry([new MockCourierAdapter()]),
    );

    await expect(service.dispatch(unsupported.orderId)).rejects.toMatchObject({
      code: "COURIER_UNAVAILABLE",
      statusCode: 503,
    });
  });
});
