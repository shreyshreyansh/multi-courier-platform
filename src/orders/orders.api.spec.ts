import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { Server } from "node:net";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../app.module";
import { configureHttpApplication } from "../app.setup";

const validOrder = {
  orderId: "ORDER-API-1001",
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
    number: "INV-API-1001",
    amount: 1_299,
    currency: "INR",
  },
};

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly requestId: unknown;
  };
}

describe("Orders HTTP API", () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(app.get(Logger));
    configureHttpApplication(app);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts a valid normalized order and reports its dispatch state", async () => {
    const response = await request(httpServer)
      .post("/api/v1/orders")
      .send(validOrder)
      .expect(202);

    expect(response.body).toMatchObject({
      disposition: "created",
      order: {
        orderId: "ORDER-API-1001",
        courierPartner: "mock",
        status: "PENDING",
      },
    });
  });

  it("rejects unknown properties rather than silently accepting an ambiguous payload", async () => {
    const response = await request(httpServer)
      .post("/api/v1/orders")
      .send({ ...validOrder, unexpected: true })
      .expect(400);

    const body = response.body as ErrorEnvelope;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it("returns a useful 409 envelope for conflicting idempotency keys", async () => {
    await request(httpServer)
      .post("/api/v1/orders")
      .send(validOrder)
      .expect(202);

    const response = await request(httpServer)
      .post("/api/v1/orders")
      .send({
        ...validOrder,
        parcel: { ...validOrder.parcel, weightGrams: 900 },
      })
      .expect(409);

    const body = response.body as ErrorEnvelope;
    expect(body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it("retrieves a normalized dispatched state and cancels the accepted order", async () => {
    await request(httpServer)
      .post("/api/v1/orders")
      .send(validOrder)
      .expect(202);

    const tracked = await request(httpServer)
      .get(`/api/v1/orders/${validOrder.orderId}/track`)
      .expect(200);
    const cancelled = await request(httpServer)
      .post(`/api/v1/orders/${validOrder.orderId}/cancel`)
      .expect(200);

    expect(tracked.body as unknown).toMatchObject({
      orderId: validOrder.orderId,
      status: "CREATED",
    });
    expect(cancelled.body as unknown).toMatchObject({
      orderId: validOrder.orderId,
      status: "CANCELLED",
    });
  });

  it("accepts a batch, reports item-level admission, and exposes a batch status resource", async () => {
    const response = await request(httpServer)
      .post("/api/v1/orders/bulk")
      .send({
        orders: [
          validOrder,
          {
            ...validOrder,
            orderId: "ORDER-API-BATCH-1002",
            invoice: { ...validOrder.invoice, number: "INV-API-BATCH-1002" },
          },
        ],
      })
      .expect(202);

    expect(response.body as unknown).toMatchObject({
      status: "ACCEPTED",
      totalCount: 2,
      acceptedCount: 2,
      failedCount: 0,
    });

    const batchId = (response.body as { readonly batchId: string }).batchId;
    const batch = await request(httpServer)
      .get("/api/v1/batches/" + batchId)
      .expect(200);

    expect(batch.body as unknown).toMatchObject({
      batchId,
      totalCount: 2,
      items: [
        { orderId: validOrder.orderId },
        { orderId: "ORDER-API-BATCH-1002" },
      ],
    });
  });

  it("rejects a batch that exceeds the documented 100-order limit", async () => {
    const orders = Array.from({ length: 101 }, (_, index) => ({
      ...validOrder,
      orderId: `ORDER-API-LIMIT-${String(index).padStart(3, "0")}`,
      invoice: {
        ...validOrder.invoice,
        number: `INV-API-LIMIT-${String(index).padStart(3, "0")}`,
      },
    }));

    const response = await request(httpServer)
      .post("/api/v1/orders/bulk")
      .send({ orders })
      .expect(400);

    expect((response.body as ErrorEnvelope).error.code).toBe(
      "BATCH_VALIDATION_ERROR",
    );
  });
});
