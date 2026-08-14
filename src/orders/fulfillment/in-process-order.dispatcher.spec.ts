import { describe, expect, it } from "vitest";

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
});

class RecordingDispatcherLogger {
  public readonly entries: Array<{
    readonly orderId: string;
    readonly message: string;
  }> = [];

  public error(context: unknown, message: string): void {
    const record =
      typeof context === "object" && context !== null
        ? (context as { readonly orderId?: unknown })
        : {};

    this.entries.push({
      orderId: typeof record.orderId === "string" ? record.orderId : "unknown",
      message,
    });
  }
}
