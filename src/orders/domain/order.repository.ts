import type {
  CreateOrderCommand,
  OrderStatus,
  StoredOrder,
} from "./order.types";

export type OrderAdmission =
  | { readonly disposition: "created"; readonly order: StoredOrder }
  | { readonly disposition: "replayed"; readonly order: StoredOrder }
  | { readonly disposition: "conflict"; readonly order: StoredOrder };

export type CourierOperation = "DISPATCH" | "TRACK" | "CANCEL";
export type AttemptOutcome = "STARTED" | "SUCCEEDED" | "FAILED";
export type AuditMetadata = Readonly<Record<string, string | number | boolean>>;

export interface CourierAttemptInput {
  readonly orderId: string;
  readonly operation: CourierOperation;
  readonly outcome: AttemptOutcome;
  readonly requestMetadata?: AuditMetadata;
  readonly responseMetadata?: AuditMetadata;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface TrackingEventInput {
  readonly fingerprint: string;
  readonly status: OrderStatus;
  readonly occurredAt: Date;
  readonly message: string;
  readonly location?: string;
}

export interface OrderRepository {
  admit(
    command: CreateOrderCommand,
    requestFingerprint: string,
  ): Promise<OrderAdmission>;
  findByOrderId(orderId: string): Promise<StoredOrder | undefined>;
  save(order: StoredOrder): Promise<StoredOrder>;
  recordAttempt(attempt: CourierAttemptInput): Promise<void>;
  appendTrackingEvents(
    orderId: string,
    events: readonly TrackingEventInput[],
  ): Promise<void>;
}
