import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { ApplicationError } from "../../common/application-error";
import type { CreateOrderCommand, OrderStatus } from "../domain/order.types";

import type { CreateOrderResult } from "./order.service";

type BatchStatus = "ACCEPTED" | "COMPLETED" | "PARTIAL_FAILURE" | "FAILED";

interface BatchOrderGateway {
  create(command: CreateOrderCommand): Promise<CreateOrderResult>;
  get(orderId: string): Promise<{ readonly status: OrderStatus }>;
}

interface AcceptedBatchItem {
  readonly orderId: string;
  readonly disposition: CreateOrderResult["disposition"];
}

interface FailedBatchItem {
  readonly orderId: string;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

type StoredBatchItem = AcceptedBatchItem | FailedBatchItem;

export interface BatchItemView {
  readonly orderId: string;
  readonly disposition?: CreateOrderResult["disposition"];
  readonly status?: OrderStatus;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface BatchView {
  readonly batchId: string;
  readonly status: BatchStatus;
  readonly totalCount: number;
  readonly acceptedCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly items: readonly BatchItemView[];
}

@Injectable()
export class BatchService {
  private readonly batches = new Map<string, readonly StoredBatchItem[]>();

  public constructor(private readonly orders: BatchOrderGateway) {}

  public async create(
    commands: readonly CreateOrderCommand[],
  ): Promise<BatchView> {
    if (commands.length < 1 || commands.length > 100) {
      throw new ApplicationError(
        "BATCH_VALIDATION_ERROR",
        400,
        "A batch must contain between 1 and 100 orders.",
      );
    }

    const items = await Promise.all(
      commands.map(async (command): Promise<StoredBatchItem> => {
        try {
          const result = await this.orders.create(command);
          return {
            orderId: command.orderId,
            disposition: result.disposition,
          };
        } catch (error) {
          return {
            orderId: command.orderId,
            error: {
              code:
                error instanceof ApplicationError
                  ? error.code
                  : "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Order admission could not be completed.",
            },
          };
        }
      }),
    );
    const batchId = randomUUID();
    this.batches.set(batchId, items);

    return this.toView(batchId, items);
  }

  public async get(batchId: string): Promise<BatchView> {
    const items = this.batches.get(batchId);

    if (items === undefined) {
      throw new ApplicationError(
        "BATCH_NOT_FOUND",
        404,
        "Batch " + batchId + " was not found.",
      );
    }

    return this.toView(batchId, items);
  }

  private async toView(
    batchId: string,
    items: readonly StoredBatchItem[],
  ): Promise<BatchView> {
    const itemViews = await Promise.all(
      items.map(async (item): Promise<BatchItemView> => {
        if ("error" in item) {
          return item;
        }

        const order = await this.orders.get(item.orderId);
        return {
          ...item,
          status: order.status,
        };
      }),
    );
    const acceptedCount = itemViews.filter(
      (item) => item.error === undefined,
    ).length;
    const failedCount = itemViews.filter(
      (item) => item.error !== undefined || item.status === "FAILED",
    ).length;
    const completedCount = itemViews.filter(
      (item) =>
        item.status !== undefined &&
        item.status !== "PENDING" &&
        item.status !== "PROCESSING",
    ).length;

    return {
      batchId,
      status: batchStatus(itemViews, failedCount, completedCount),
      totalCount: itemViews.length,
      acceptedCount,
      completedCount,
      failedCount,
      items: itemViews,
    };
  }
}

function batchStatus(
  items: readonly BatchItemView[],
  failedCount: number,
  completedCount: number,
): BatchStatus {
  if (failedCount === items.length) {
    return "FAILED";
  }

  if (failedCount > 0) {
    return "PARTIAL_FAILURE";
  }

  return completedCount === items.length ? "COMPLETED" : "ACCEPTED";
}
