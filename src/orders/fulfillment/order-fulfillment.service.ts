import { createHash } from "node:crypto";

import { ApplicationError } from "../../common/application-error";
import type { CourierAdapterRegistry } from "../../couriers/courier-adapter.registry";
import type {
  CourierDispatchResult,
  CourierTrackingResult,
} from "../../couriers/courier-adapter";
import type { OrderRepository } from "../domain/order.repository";
import type { OrderStatus, StoredOrder } from "../domain/order.types";

export class OrderFulfillmentService {
  public constructor(
    private readonly orderRepository: OrderRepository,
    private readonly adapters: CourierAdapterRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async dispatch(orderId: string): Promise<StoredOrder> {
    const current = await this.getOrder(orderId);

    if (
      current.status === "CREATED" ||
      current.status === "PICKED_UP" ||
      current.status === "IN_TRANSIT"
    ) {
      return current;
    }

    if (current.status === "CANCELLED" || current.status === "DELIVERED") {
      throw new ApplicationError(
        "ORDER_NOT_DISPATCHABLE",
        409,
        `Order ${orderId} cannot be dispatched after it reached ${current.status}.`,
      );
    }

    const adapter = this.adapters.get(current.courierPartner);
    await this.orderRepository.save(this.withStatus(current, "PROCESSING"));
    await this.orderRepository.recordAttempt({
      orderId,
      operation: "DISPATCH",
      outcome: "STARTED",
      requestMetadata: { courierPartner: current.courierPartner },
    });

    let dispatched: CourierDispatchResult;
    try {
      dispatched = await adapter.create(current);
    } catch (error) {
      await this.orderRepository.save({
        ...current,
        status: "FAILED",
        failureCode: "COURIER_DISPATCH_FAILED",
        failureMessage:
          error instanceof Error ? error.message : "Courier dispatch failed.",
        updatedAt: this.now(),
      });
      await this.orderRepository.recordAttempt({
        orderId,
        operation: "DISPATCH",
        outcome: "FAILED",
        errorCode: error instanceof ApplicationError ? error.code : undefined,
        errorMessage:
          error instanceof Error ? error.message : "Courier dispatch failed.",
      });

      throw new ApplicationError(
        "COURIER_DISPATCH_FAILED",
        502,
        `Courier ${current.courierPartner} could not accept order ${orderId}.`,
      );
    }

    const persisted = await this.orderRepository.save({
      ...current,
      status: dispatched.status,
      providerShipmentId: dispatched.providerShipmentId,
      awb: dispatched.awb,
      updatedAt: this.now(),
    });
    await this.orderRepository.recordAttempt({
      orderId,
      operation: "DISPATCH",
      outcome: "SUCCEEDED",
      responseMetadata: {
        providerShipmentId: dispatched.providerShipmentId,
        awb: dispatched.awb,
        status: dispatched.status,
      },
    });

    return persisted;
  }

  public async track(orderId: string): Promise<CourierTrackingResult> {
    const current = await this.getOrder(orderId);
    const adapter = this.adapters.get(current.courierPartner);
    await this.orderRepository.recordAttempt({
      orderId,
      operation: "TRACK",
      outcome: "STARTED",
      requestMetadata: { courierPartner: current.courierPartner },
    });

    let tracking: CourierTrackingResult;
    try {
      tracking = await adapter.track(current);
    } catch (error) {
      await this.orderRepository.recordAttempt({
        orderId,
        operation: "TRACK",
        outcome: "FAILED",
        errorCode: error instanceof ApplicationError ? error.code : undefined,
        errorMessage:
          error instanceof Error ? error.message : "Courier tracking failed.",
      });
      throw error;
    }

    if (tracking.status !== current.status) {
      await this.orderRepository.save(
        this.withStatus(current, tracking.status),
      );
    }

    await this.orderRepository.appendTrackingEvents(
      orderId,
      tracking.events.map((event) => ({
        fingerprint: fingerprintTrackingEvent(event),
        status: event.status,
        occurredAt: new Date(event.occurredAt),
        message: event.message,
        ...(event.location === undefined ? {} : { location: event.location }),
      })),
    );
    await this.orderRepository.recordAttempt({
      orderId,
      operation: "TRACK",
      outcome: "SUCCEEDED",
      responseMetadata: {
        status: tracking.status,
        eventCount: tracking.events.length,
      },
    });

    return tracking;
  }

  public async cancel(orderId: string): Promise<StoredOrder> {
    const current = await this.getOrder(orderId);

    if (current.status === "CANCELLED") {
      return current;
    }

    if (current.status === "DELIVERED") {
      throw new ApplicationError(
        "ORDER_NOT_CANCELLABLE",
        409,
        `Order ${orderId} has already been delivered.`,
      );
    }

    if (current.status !== "PENDING") {
      await this.orderRepository.recordAttempt({
        orderId,
        operation: "CANCEL",
        outcome: "STARTED",
        requestMetadata: { courierPartner: current.courierPartner },
      });

      try {
        await this.adapters.get(current.courierPartner).cancel(current);
      } catch (error) {
        await this.orderRepository.recordAttempt({
          orderId,
          operation: "CANCEL",
          outcome: "FAILED",
          errorCode: error instanceof ApplicationError ? error.code : undefined,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Courier cancellation failed.",
        });
        throw error;
      }

      await this.orderRepository.recordAttempt({
        orderId,
        operation: "CANCEL",
        outcome: "SUCCEEDED",
        responseMetadata: { status: "CANCELLED" },
      });
    }

    return this.orderRepository.save(this.withStatus(current, "CANCELLED"));
  }

  private async getOrder(orderId: string): Promise<StoredOrder> {
    const order = await this.orderRepository.findByOrderId(orderId);

    if (order === undefined) {
      throw new ApplicationError(
        "ORDER_NOT_FOUND",
        404,
        `Order ${orderId} was not found.`,
      );
    }

    return order;
  }

  private withStatus(order: StoredOrder, status: OrderStatus): StoredOrder {
    return { ...order, status, updatedAt: this.now() };
  }
}

function fingerprintTrackingEvent(event: {
  readonly occurredAt: string;
  readonly status: OrderStatus;
  readonly message: string;
  readonly location?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        occurredAt: event.occurredAt,
        status: event.status,
        message: event.message,
        location: event.location ?? null,
      }),
    )
    .digest("hex");
}
