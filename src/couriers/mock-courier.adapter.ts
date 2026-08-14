import { createHash } from "node:crypto";

import type {
  CourierAdapter,
  CourierCancelResult,
  CourierDispatchResult,
  CourierTrackingResult,
} from "./courier-adapter";
import type { StoredOrder } from "../orders/domain/order.types";

interface MockShipment {
  readonly providerShipmentId: string;
  readonly awb: string;
  status: "CREATED" | "CANCELLED";
  readonly createdAt: string;
}

export class MockCourierAdapter implements CourierAdapter {
  public readonly partner = "mock" as const;

  private readonly shipments = new Map<string, MockShipment>();

  public create(order: StoredOrder): Promise<CourierDispatchResult> {
    const existing = this.shipments.get(order.orderId);
    const shipment = existing ?? this.createShipment(order);
    this.shipments.set(order.orderId, shipment);

    return Promise.resolve({
      providerShipmentId: shipment.providerShipmentId,
      awb: shipment.awb,
      status: "CREATED",
      raw: { mock: true, shipmentId: shipment.providerShipmentId },
    });
  }

  public track(order: StoredOrder): Promise<CourierTrackingResult> {
    const shipment = this.shipments.get(order.orderId);

    if (shipment === undefined) {
      return Promise.resolve({
        orderId: order.orderId,
        status: "PENDING",
        events: [],
        raw: { mock: true, found: false },
      });
    }

    return Promise.resolve({
      orderId: order.orderId,
      status: shipment.status,
      awb: shipment.awb,
      providerShipmentId: shipment.providerShipmentId,
      events: [
        {
          occurredAt: shipment.createdAt,
          status: shipment.status,
          message:
            shipment.status === "CANCELLED"
              ? "Shipment cancelled."
              : "Shipment created.",
        },
      ],
      raw: { mock: true, shipmentId: shipment.providerShipmentId },
    });
  }

  public cancel(order: StoredOrder): Promise<CourierCancelResult> {
    const shipment = this.shipments.get(order.orderId);

    if (shipment !== undefined) {
      shipment.status = "CANCELLED";
    }

    return Promise.resolve({
      status: "CANCELLED",
      raw: { mock: true, cancelled: true },
    });
  }

  private createShipment(order: StoredOrder): MockShipment {
    const digest = createHash("sha256")
      .update(order.orderId)
      .digest("hex")
      .slice(0, 10)
      .toUpperCase();

    return {
      providerShipmentId: `mock-shipment-${digest.toLowerCase()}`,
      awb: `MOCK-${digest}`,
      status: "CREATED",
      createdAt: new Date().toISOString(),
    };
  }
}
