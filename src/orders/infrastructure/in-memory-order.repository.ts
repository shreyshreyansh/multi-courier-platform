import { randomUUID } from "node:crypto";

import type {
  CourierAttemptInput,
  OrderAdmission,
  OrderRepository,
  TrackingEventInput,
} from "../domain/order.repository";
import type { CreateOrderCommand, StoredOrder } from "../domain/order.types";

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, StoredOrder>();
  private readonly attempts: CourierAttemptInput[] = [];
  private readonly trackingEvents = new Map<string, TrackingEventInput>();

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public admit(
    command: CreateOrderCommand,
    requestFingerprint: string,
  ): Promise<OrderAdmission> {
    const existing = this.orders.get(command.orderId);

    if (existing !== undefined) {
      return Promise.resolve(
        existing.requestFingerprint === requestFingerprint
          ? { disposition: "replayed", order: existing }
          : { disposition: "conflict", order: existing },
      );
    }

    const timestamp = this.now();
    const order: StoredOrder = {
      id: randomUUID(),
      orderId: command.orderId,
      courierPartner: command.courierPartner,
      serviceType: command.serviceType,
      paymentMode: command.paymentMode,
      requestFingerprint,
      command,
      status: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.orders.set(order.orderId, order);
    return Promise.resolve({ disposition: "created", order });
  }

  public findByOrderId(orderId: string): Promise<StoredOrder | undefined> {
    return Promise.resolve(this.orders.get(orderId));
  }

  public save(order: StoredOrder): Promise<StoredOrder> {
    this.orders.set(order.orderId, order);
    return Promise.resolve(order);
  }

  public recordAttempt(attempt: CourierAttemptInput): Promise<void> {
    this.attempts.push(attempt);
    return Promise.resolve();
  }

  public appendTrackingEvents(
    orderId: string,
    events: readonly TrackingEventInput[],
  ): Promise<void> {
    for (const event of events) {
      this.trackingEvents.set(`${orderId}:${event.fingerprint}`, event);
    }

    return Promise.resolve();
  }
}
