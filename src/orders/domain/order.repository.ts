import type { CreateOrderCommand, StoredOrder } from "./order.types";

export type OrderAdmission =
  | { readonly disposition: "created"; readonly order: StoredOrder }
  | { readonly disposition: "replayed"; readonly order: StoredOrder }
  | { readonly disposition: "conflict"; readonly order: StoredOrder };

export interface OrderRepository {
  admit(
    command: CreateOrderCommand,
    requestFingerprint: string,
  ): Promise<OrderAdmission>;
  findByOrderId(orderId: string): Promise<StoredOrder | undefined>;
  save(order: StoredOrder): Promise<StoredOrder>;
}
