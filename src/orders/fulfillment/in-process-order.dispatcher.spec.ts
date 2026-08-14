import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "../../common/application-error";
import { InProcessOrderDispatcher } from "./in-process-order.dispatcher";

describe("InProcessOrderDispatcher", () => {
  it("schedules courier dispatch after admission instead of blocking the caller", async () => {
    const scheduledTasks: Array<() => void> = [];
    const dispatchedOrderIds: string[] = [];
    const dispatcher = new InProcessOrderDispatcher(
      {
        dispatch: (orderId) => {
          dispatchedOrderIds.push(orderId);
          return Promise.resolve(undefined as never);
        },
      },
      new RecordingDispatcherLogger(),
      (task) => scheduledTasks.push(task),
    );

    await dispatcher.enqueueOrderDispatch("ORDER-DISPATCH-1001");

    expect(dispatchedOrderIds).toEqual([]);
    expect(scheduledTasks).toHaveLength(1);

    scheduledTasks[0]?.();
    await Promise.resolve();

    expect(dispatchedOrderIds).toEqual(["ORDER-DISPATCH-1001"]);
  });

  it("records a dispatch failure without producing an unhandled rejection", async () => {
    const logger = new RecordingDispatcherLogger();
    const dispatcher = new InProcessOrderDispatcher(
      {
        dispatch: () => Promise.reject(new Error("provider unavailable")),
      },
      logger,
      (task) => task(),
      { maxAttempts: 1, baseDelayMs: 25 },
    );

    await dispatcher.enqueueOrderDispatch("ORDER-DISPATCH-1002");
    await Promise.resolve();

    expect(logger.entries).toEqual([
      {
        orderId: "ORDER-DISPATCH-1002",
        message: "Asynchronous courier dispatch failed.",
      },
    ]);
  });

  it("retries transient courier dispatch failures with bounded exponential backoff", async () => {
    const scheduledTasks: Array<{
      readonly task: () => void;
      readonly delayMs: number;
    }> = [];
    const logger = new RecordingDispatcherLogger();
    const dispatch = vi
      .fn<(orderId: string) => Promise<never>>()
      .mockRejectedValueOnce(
        new ApplicationError(
          "COURIER_DISPATCH_FAILED",
          502,
          "Provider is temporarily unavailable.",
        ),
      )
      .mockResolvedValueOnce(undefined as never);
    const dispatcher = new InProcessOrderDispatcher(
      { dispatch },
      logger,
      (task, delayMs = 0) => scheduledTasks.push({ task, delayMs }),
      { maxAttempts: 3, baseDelayMs: 25 },
    );

    await dispatcher.enqueueOrderDispatch("ORDER-DISPATCH-1003");
    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(0);

    scheduledTasks[0]?.task();
    await Promise.resolve();
    await Promise.resolve();

    expect(scheduledTasks).toHaveLength(2);
    expect(scheduledTasks[1]?.delayMs).toBe(25);
    expect(logger.warnings).toEqual([
      {
        orderId: "ORDER-DISPATCH-1003",
        message: "Retrying asynchronous courier dispatch.",
      },
    ]);

    scheduledTasks[1]?.task();
    await Promise.resolve();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(scheduledTasks).toHaveLength(2);
    expect(logger.entries).toEqual([]);
  });
});

class RecordingDispatcherLogger {
  public readonly entries: Array<{
    readonly orderId: string;
    readonly message: string;
  }> = [];

  public readonly warnings: Array<{
    readonly orderId: string;
    readonly message: string;
  }> = [];

  public error(context: unknown, message: string): void {
    this.entries.push(this.toEntry(context, message));
  }

  public warn(context: unknown, message: string): void {
    this.warnings.push(this.toEntry(context, message));
  }

  private toEntry(
    context: unknown,
    message: string,
  ): { readonly orderId: string; readonly message: string } {
    const record =
      typeof context === "object" && context !== null
        ? (context as { readonly orderId?: unknown })
        : {};

    return {
      orderId: typeof record.orderId === "string" ? record.orderId : "unknown",
      message,
    };
  }
}
