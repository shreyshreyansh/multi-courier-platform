import { ApplicationError } from "../../common/application-error";
import type { CourierAdapterRegistry } from "../../couriers/courier-adapter.registry";
import type { CourierTrackingResult } from "../../couriers/courier-adapter";
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

    try {
      const dispatched = await adapter.create(current);
      return this.orderRepository.save({
        ...current,
        status: dispatched.status,
        providerShipmentId: dispatched.providerShipmentId,
        awb: dispatched.awb,
        updatedAt: this.now(),
      });
    } catch (error) {
      await this.orderRepository.save({
        ...current,
        status: "FAILED",
        failureCode: "COURIER_DISPATCH_FAILED",
        failureMessage:
          error instanceof Error ? error.message : "Courier dispatch failed.",
        updatedAt: this.now(),
      });

      throw new ApplicationError(
        "COURIER_DISPATCH_FAILED",
        502,
        `Courier ${current.courierPartner} could not accept order ${orderId}.`,
      );
    }
  }

  public async track(orderId: string): Promise<CourierTrackingResult> {
    const current = await this.getOrder(orderId);
    const tracking = await this.adapters
      .get(current.courierPartner)
      .track(current);

    if (tracking.status !== current.status) {
      await this.orderRepository.save(
        this.withStatus(current, tracking.status),
      );
    }

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
      await this.adapters.get(current.courierPartner).cancel(current);
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
