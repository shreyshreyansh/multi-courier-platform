import type {
  CourierPartner,
  OrderStatus,
  StoredOrder,
} from "../orders/domain/order.types";

export interface CourierDispatchResult {
  readonly providerShipmentId: string;
  readonly awb: string;
  readonly status: Extract<OrderStatus, "CREATED" | "PICKED_UP" | "IN_TRANSIT">;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface CourierTrackingResult {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly awb?: string;
  readonly providerShipmentId?: string;
  readonly events: readonly CourierTrackingEvent[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface CourierTrackingEvent {
  readonly occurredAt: string;
  readonly status: OrderStatus;
  readonly message: string;
  readonly location?: string;
}

export interface CourierCancelResult {
  readonly status: "CANCELLED";
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface CourierAdapter {
  readonly partner: CourierPartner;
  create(order: StoredOrder): Promise<CourierDispatchResult>;
  track(order: StoredOrder): Promise<CourierTrackingResult>;
  cancel(order: StoredOrder): Promise<CourierCancelResult>;
}
