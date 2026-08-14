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

  it("retrieves a normalized pending state and cancels the accepted order", async () => {
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
      status: "PENDING",
    });
    expect(cancelled.body as unknown).toMatchObject({
      orderId: validOrder.orderId,
      status: "CANCELLED",
    });
  });
});
