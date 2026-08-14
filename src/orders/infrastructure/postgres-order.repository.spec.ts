import { describe, expect, it } from "vitest";

import { fingerprintOrderRequest } from "../domain/request-fingerprint";
import type { CreateOrderCommand } from "../domain/order.types";
import {
  PostgresOrderRepository,
  type PrismaOrderClient,
  type StoredCourierAttemptRecord,
  type StoredOrderRecord,
  type StoredTrackingEventRecord,
} from "./postgres-order.repository";

const command: CreateOrderCommand = {
  orderId: "ORDER-POSTGRES-1001",
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
  invoice: { number: "INV-POSTGRES-1001", amount: 1_299, currency: "INR" },
};

describe("PostgresOrderRepository", () => {
  it("persists an order and replays the same normalized request", async () => {
    const database = new FakePrismaOrderClient();
    const repository = new PostgresOrderRepository(database);
    const fingerprint = fingerprintOrderRequest(command);

    const first = await repository.admit(command, fingerprint);
    const replay = await repository.admit({ ...command }, fingerprint);

    expect(first).toMatchObject({
      disposition: "created",
      order: { orderId: command.orderId, status: "PENDING" },
    });
    expect(replay).toMatchObject({
      disposition: "replayed",
      order: { id: first.order.id },
    });
    expect(database.records).toHaveLength(1);
  });

  it("reports a conflict for the same order ID with a different fingerprint", async () => {
    const repository = new PostgresOrderRepository(new FakePrismaOrderClient());

    await repository.admit(command, fingerprintOrderRequest(command));
    const conflicting = await repository.admit(command, "another-fingerprint");

    expect(conflicting.disposition).toBe("conflict");
  });

  it("persists lifecycle updates and returns undefined for an absent order", async () => {
    const repository = new PostgresOrderRepository(new FakePrismaOrderClient());
    const admitted = await repository.admit(
      command,
      fingerprintOrderRequest(command),
    );

    const saved = await repository.save({
      ...admitted.order,
      status: "CREATED",
      providerShipmentId: "mock-shipment-1001",
      awb: "MOCK-1001",
      updatedAt: new Date("2026-08-14T00:01:00.000Z"),
    });

    await expect(
      repository.findByOrderId("ORDER-DOES-NOT-EXIST"),
    ).resolves.toBe(undefined);
    expect(saved).toMatchObject({
      status: "CREATED",
      providerShipmentId: "mock-shipment-1001",
      awb: "MOCK-1001",
    });
  });

  it("persists sanitized attempts and ignores duplicate tracking events", async () => {
    const database = new FakePrismaOrderClient();
    const repository = new PostgresOrderRepository(database);
    await repository.admit(command, fingerprintOrderRequest(command));

    await repository.recordAttempt({
      orderId: command.orderId,
      operation: "DISPATCH",
      outcome: "SUCCEEDED",
      responseMetadata: { status: "CREATED", awb: "MOCK-1001" },
    });
    await repository.appendTrackingEvents(command.orderId, [
      {
        fingerprint: "tracking-event-1001",
        status: "CREATED",
        occurredAt: new Date("2026-08-14T00:01:00.000Z"),
        message: "Shipment created.",
      },
    ]);
    await repository.appendTrackingEvents(command.orderId, [
      {
        fingerprint: "tracking-event-1001",
        status: "CREATED",
        occurredAt: new Date("2026-08-14T00:01:00.000Z"),
        message: "Shipment created.",
      },
    ]);

    expect(database.attempts).toMatchObject([
      {
        operation: "DISPATCH",
        outcome: "SUCCEEDED",
        responseMetadata: { status: "CREATED" },
      },
    ]);
    expect(database.trackingEvents).toHaveLength(1);
    expect(database.trackingEvents[0]?.raw).toBeUndefined();
  });
});

class FakePrismaOrderClient implements PrismaOrderClient {
  public readonly records: StoredOrderRecord[] = [];
  public readonly attempts: StoredCourierAttemptRecord[] = [];
  public readonly trackingEvents: StoredTrackingEventRecord[] = [];

  public readonly order = {
    findUnique: ({ where }: { readonly where: { readonly orderId: string } }) =>
      Promise.resolve(
        this.records.find((record) => record.orderId === where.orderId) ?? null,
      ),
    create: ({ data }: { readonly data: StoredOrderRecord }) => {
      const existing = this.records.find(
        (record) => record.orderId === data.orderId,
      );

      if (existing !== undefined) {
        return Promise.reject(new PrismaUniqueConstraintError());
      }

      this.records.push(data);
      return Promise.resolve(data);
    },
    update: ({
      where,
      data,
    }: {
      readonly where: { readonly orderId: string };
      readonly data: StoredOrderRecord;
    }) => {
      const index = this.records.findIndex(
        (record) => record.orderId === where.orderId,
      );

      if (index < 0) {
        throw new Error("Order was not found.");
      }

      this.records[index] = data;
      return Promise.resolve(data);
    },
  };

  public readonly courierAttempt = {
    create: ({ data }: { readonly data: StoredCourierAttemptRecord }) => {
      this.attempts.push(data);
      return Promise.resolve(undefined);
    },
  };

  public readonly trackingEvent = {
    create: ({ data }: { readonly data: StoredTrackingEventRecord }) => {
      const duplicate = this.trackingEvents.some(
        (event) =>
          event.orderId === data.orderId &&
          event.fingerprint === data.fingerprint,
      );

      if (duplicate) {
        return Promise.reject(new PrismaUniqueConstraintError());
      }

      this.trackingEvents.push(data);
      return Promise.resolve(undefined);
    },
  };

  public transaction<T>(
    operation: (client: PrismaOrderClient) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
}

class PrismaUniqueConstraintError extends Error {
  public readonly code = "P2002";

  public constructor() {
    super("Unique constraint failed.");
  }
}
