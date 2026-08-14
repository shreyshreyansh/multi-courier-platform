import { describe, expect, it } from "vitest";

import type { StoredOrder } from "../orders/domain/order.types";
import { UrbaneboltAdapter } from "./urbanebolt.adapter";

const order: StoredOrder = {
  id: "order-1",
  orderId: "ORDER-URBANE-1001",
  courierPartner: "urbanebolt",
  serviceType: "FORWARD",
  paymentMode: "PREPAID",
  requestFingerprint: "fingerprint",
  command: {
    orderId: "ORDER-URBANE-1001",
    courierPartner: "urbanebolt",
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
    invoice: { number: "INV-URBANE-1001", amount: 1_299, currency: "INR" },
  },
  status: "PENDING",
  createdAt: new Date("2026-08-14T00:00:00.000Z"),
  updatedAt: new Date("2026-08-14T00:00:00.000Z"),
};

describe("UrbaneboltAdapter", () => {
  it("authenticates once, maps the manifest request, and normalizes tracking and cancellation", async () => {
    const requests: Array<{
      readonly url: string;
      readonly init?: RequestInit;
    }> = [];
    const adapter = new UrbaneboltAdapter(
      {
        baseUrl: "https://uat.urbanebolt.in",
        username: "demo-user",
        password: "demo-password",
        timeoutMs: 1_000,
      },
      (url, init) => {
        requests.push({ url: url.toString(), init });

        if (url.toString().endsWith("/auth/getToken/")) {
          return Promise.resolve(jsonResponse({ token: "uat-token" }));
        }

        if (url.toString().includes("/manifest/")) {
          return Promise.resolve(
            jsonResponse({ data: [{ shipmentId: "SHIP-1", awb: "UBE-1001" }] }),
          );
        }

        if (url.toString().includes("/tracking-pub/")) {
          return Promise.resolve(
            jsonResponse({
              data: {
                status: "In Transit",
                location: "Mumbai Hub",
                message: "Delivery for Ada Lovelace is at Mumbai Hub.",
              },
            }),
          );
        }

        return Promise.resolve(jsonResponse({ success: true }));
      },
    );

    const created = await adapter.create(order);
    const tracked = await adapter.track({ ...order, awb: created.awb });
    const cancelled = await adapter.cancel({ ...order, awb: created.awb });

    expect(created).toMatchObject({
      providerShipmentId: "SHIP-1",
      awb: "UBE-1001",
      status: "CREATED",
    });
    expect(tracked).toMatchObject({ status: "IN_TRANSIT", awb: "UBE-1001" });
    expect(tracked.events[0]?.message).toBe("Urbanebolt status: IN_TRANSIT.");
    expect(JSON.stringify(tracked.events)).not.toContain("Ada Lovelace");
    expect(cancelled.status).toBe("CANCELLED");
    expect(requests).toHaveLength(4);
    expect(requests[1]?.url).toContain("/api/v1/services/manifest/");
    expect(requests[2]?.url).toContain("tracking-pub/?awb=UBE-1001");
    expect(requests[3]?.url).toContain("/api/v1/services/cancel/");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
