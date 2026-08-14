import type { OrderDispatcher } from "../application/order.service";

import type { OrderFulfillmentService } from "./order-fulfillment.service";

export interface DispatchLogger {
  error(context: unknown, message: string): void;
}

export type DispatchScheduler = (task: () => void) => void;

export class InProcessOrderDispatcher implements OrderDispatcher {
  public constructor(
    private readonly fulfillment: Pick<OrderFulfillmentService, "dispatch">,
    private readonly logger: DispatchLogger,
    private readonly schedule: DispatchScheduler = (task) => {
      setImmediate(task);
    },
  ) {}

  public enqueueOrderDispatch(orderId: string): Promise<void> {
    this.schedule(() => {
      void this.dispatch(orderId);
    });

    return Promise.resolve();
  }

  private async dispatch(orderId: string): Promise<void> {
    try {
      await this.fulfillment.dispatch(orderId);
    } catch (error) {
      this.logger.error(
        { err: error, orderId },
        "Asynchronous courier dispatch failed.",
      );
    }
  }
}
