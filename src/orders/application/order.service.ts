import { Injectable } from "@nestjs/common";

import { ApplicationError } from "../../common/application-error";
import type { OrderRepository } from "../domain/order.repository";
import { fingerprintOrderRequest } from "../domain/request-fingerprint";
import type { CreateOrderCommand, StoredOrder } from "../domain/order.types";

export interface OrderDispatcher {
  enqueueOrderDispatch(orderId: string): Promise<void>;
}

export interface CreateOrderResult {
  readonly disposition: "created" | "replayed";
  readonly order: StoredOrder;
}

@Injectable()
export class OrderService {
  public constructor(
    private readonly orderRepository: OrderRepository,
    private readonly dispatcher: OrderDispatcher,
  ) {}

  public async create(command: CreateOrderCommand): Promise<CreateOrderResult> {
    const admission = await this.orderRepository.admit(
      command,
      fingerprintOrderRequest(command),
    );

    if (admission.disposition === "conflict") {
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        409,
        `Order ${command.orderId} already exists with a different request payload.`,
        [
          {
            field: "orderId",
            reason: "Re-use the original payload or provide a new orderId.",
          },
        ],
      );
    }

    if (admission.disposition === "created") {
      await this.dispatcher.enqueueOrderDispatch(admission.order.orderId);
    }

    return admission;
  }

  public async get(orderId: string): Promise<StoredOrder> {
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
}
