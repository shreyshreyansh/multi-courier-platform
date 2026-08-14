import type { OrderDispatcher } from "../application/order.service";

import { ApplicationError } from "../../common/application-error";
import type { OrderFulfillmentService } from "./order-fulfillment.service";

export interface DispatchLogger {
  error(context: unknown, message: string): void;
  warn(context: unknown, message: string): void;
}

export type DispatchScheduler = (task: () => void, delayMs?: number) => void;

export interface DispatchRetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

const defaultRetryPolicy: DispatchRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
};

export class InProcessOrderDispatcher implements OrderDispatcher {
  public constructor(
    private readonly fulfillment: Pick<OrderFulfillmentService, "dispatch">,
    private readonly logger: DispatchLogger,
    private readonly schedule: DispatchScheduler = (task, delayMs = 0) => {
      if (delayMs === 0) {
        setImmediate(task);
        return;
      }

      setTimeout(task, delayMs);
    },
    private readonly retryPolicy: DispatchRetryPolicy = defaultRetryPolicy,
  ) {}

  public enqueueOrderDispatch(orderId: string): Promise<void> {
    this.schedule(() => {
      void this.dispatch(orderId, 1);
    });

    return Promise.resolve();
  }

  private async dispatch(orderId: string, attempt: number): Promise<void> {
    try {
      await this.fulfillment.dispatch(orderId);
    } catch (error) {
      if (this.shouldRetry(error, attempt)) {
        const delayMs = this.retryPolicy.baseDelayMs * 2 ** (attempt - 1);
        this.logger.warn(
          {
            err: error,
            orderId,
            attempt,
            nextAttempt: attempt + 1,
            delayMs,
          },
          "Retrying asynchronous courier dispatch.",
        );
        this.schedule(() => {
          void this.dispatch(orderId, attempt + 1);
        }, delayMs);
        return;
      }

      this.logger.error(
        { err: error, orderId, attempt },
        "Asynchronous courier dispatch failed.",
      );
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.retryPolicy.maxAttempts) {
      return false;
    }

    return !(
      error instanceof ApplicationError &&
      (error.statusCode < 500 || error.code === "COURIER_UNAVAILABLE")
    );
  }
}
