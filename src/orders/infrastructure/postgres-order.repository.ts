import { randomUUID } from "node:crypto";

import type {
  CourierAttemptInput,
  OrderAdmission,
  OrderRepository,
  TrackingEventInput,
} from "../domain/order.repository";
import type {
  CreateOrderCommand,
  OrderStatus,
  StoredOrder,
} from "../domain/order.types";

export interface StoredOrderRecord {
  readonly id: string;
  readonly orderId: string;
  readonly courierPartner: StoredOrder["courierPartner"];
  readonly serviceType: StoredOrder["serviceType"];
  readonly paymentMode: StoredOrder["paymentMode"];
  readonly requestFingerprint: string;
  readonly command: CreateOrderCommand;
  readonly status: OrderStatus;
  readonly providerShipmentId: string | null;
  readonly awb: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoredCourierAttemptRecord {
  readonly id: string;
  readonly orderId: string;
  readonly operation: CourierAttemptInput["operation"];
  readonly outcome: CourierAttemptInput["outcome"];
  readonly requestMetadata: CourierAttemptInput["requestMetadata"] | null;
  readonly responseMetadata: CourierAttemptInput["responseMetadata"] | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface StoredTrackingEventRecord {
  readonly id: string;
  readonly orderId: string;
  readonly fingerprint: string;
  readonly status: TrackingEventInput["status"];
  readonly occurredAt: Date;
  readonly message: string;
  readonly location: string | null;
  readonly raw?: undefined;
}

interface PrismaOrderModel {
  findUnique(args: {
    readonly where: { readonly orderId: string };
  }): Promise<StoredOrderRecord | null>;
  create(args: {
    readonly data: StoredOrderRecord;
  }): Promise<StoredOrderRecord>;
  update(args: {
    readonly where: { readonly orderId: string };
    readonly data: StoredOrderRecord;
  }): Promise<StoredOrderRecord>;
}

interface PrismaCourierAttemptModel {
  create(args: { readonly data: StoredCourierAttemptRecord }): Promise<unknown>;
}

interface PrismaTrackingEventModel {
  create(args: { readonly data: StoredTrackingEventRecord }): Promise<unknown>;
}

interface PrismaOrderTransactionClient {
  readonly order: PrismaOrderModel;
}

export interface PrismaOrderClient extends PrismaOrderTransactionClient {
  readonly courierAttempt: PrismaCourierAttemptModel;
  readonly trackingEvent: PrismaTrackingEventModel;
  transaction<T>(
    operation: (client: PrismaOrderTransactionClient) => Promise<T>,
  ): Promise<T>;
}

interface RawPrismaOrderClient {
  readonly order: {
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  readonly courierAttempt: {
    create(args: unknown): Promise<unknown>;
  };
  readonly trackingEvent: {
    create(args: unknown): Promise<unknown>;
  };
  $transaction<T>(operation: (client: unknown) => Promise<T>): Promise<T>;
}

/**
 * Narrows Prisma's generated model client to the small persistence port used by
 * the domain. Keeping the generated type at the composition boundary means the
 * domain remains testable without a database connection.
 */
export function adaptPrismaOrderClient(database: unknown): PrismaOrderClient {
  const client = database as RawPrismaOrderClient;

  return {
    order: adaptOrderModel(client),
    courierAttempt: adaptCourierAttemptModel(client),
    trackingEvent: adaptTrackingEventModel(client),
    transaction: (operation) =>
      client.$transaction((transaction) =>
        operation({ order: adaptOrderModel(transaction) }),
      ),
  };
}

export class PostgresOrderRepository implements OrderRepository {
  public constructor(
    private readonly database: PrismaOrderClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async admit(
    command: CreateOrderCommand,
    requestFingerprint: string,
  ): Promise<OrderAdmission> {
    return this.database.transaction(async (transaction) => {
      const existing = await transaction.order.findUnique({
        where: { orderId: command.orderId },
      });

      if (existing !== null) {
        return admissionForExisting(existing, requestFingerprint);
      }

      const timestamp = this.now();
      const record = toRecord({
        id: randomUUID(),
        command,
        requestFingerprint,
        status: "PENDING",
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      try {
        const created = await transaction.order.create({ data: record });
        return { disposition: "created", order: toStoredOrder(created) };
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const concurrent = await transaction.order.findUnique({
          where: { orderId: command.orderId },
        });

        if (concurrent === null) {
          throw error;
        }

        return admissionForExisting(concurrent, requestFingerprint);
      }
    });
  }

  public async findByOrderId(
    orderId: string,
  ): Promise<StoredOrder | undefined> {
    const record = await this.database.order.findUnique({
      where: { orderId },
    });

    return record === null ? undefined : toStoredOrder(record);
  }

  public async save(order: StoredOrder): Promise<StoredOrder> {
    const saved = await this.database.order.update({
      where: { orderId: order.orderId },
      data: toRecord(order),
    });

    return toStoredOrder(saved);
  }

  public async recordAttempt(attempt: CourierAttemptInput): Promise<void> {
    const order = await this.requireOrder(attempt.orderId);

    await this.database.courierAttempt.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        operation: attempt.operation,
        outcome: attempt.outcome,
        requestMetadata: attempt.requestMetadata ?? null,
        responseMetadata: attempt.responseMetadata ?? null,
        errorCode: attempt.errorCode ?? null,
        errorMessage: attempt.errorMessage ?? null,
      },
    });
  }

  public async appendTrackingEvents(
    orderId: string,
    events: readonly TrackingEventInput[],
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const order = await this.requireOrder(orderId);

    await Promise.all(
      events.map(async (event) => {
        try {
          await this.database.trackingEvent.create({
            data: {
              id: randomUUID(),
              orderId: order.id,
              fingerprint: event.fingerprint,
              status: event.status,
              occurredAt: event.occurredAt,
              message: event.message,
              location: event.location ?? null,
            },
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error;
          }
        }
      }),
    );
  }

  private async requireOrder(orderId: string): Promise<StoredOrderRecord> {
    const order = await this.database.order.findUnique({
      where: { orderId },
    });

    if (order === null) {
      throw new Error(
        `Cannot write courier audit data for missing order ${orderId}.`,
      );
    }

    return order;
  }
}

function adaptOrderModel(database: unknown): PrismaOrderModel {
  const client = database as Pick<RawPrismaOrderClient, "order">;

  return {
    findUnique: async (args) =>
      (await client.order.findUnique(args)) as StoredOrderRecord | null,
    create: async (args) =>
      (await client.order.create(args)) as StoredOrderRecord,
    update: async (args) =>
      (await client.order.update(args)) as StoredOrderRecord,
  };
}

function adaptCourierAttemptModel(
  database: unknown,
): PrismaCourierAttemptModel {
  const client = database as Pick<RawPrismaOrderClient, "courierAttempt">;

  return {
    create: (args) => client.courierAttempt.create(args),
  };
}

function adaptTrackingEventModel(database: unknown): PrismaTrackingEventModel {
  const client = database as Pick<RawPrismaOrderClient, "trackingEvent">;

  return {
    create: (args) => client.trackingEvent.create(args),
  };
}

function admissionForExisting(
  record: StoredOrderRecord,
  requestFingerprint: string,
): OrderAdmission {
  return {
    disposition:
      record.requestFingerprint === requestFingerprint
        ? "replayed"
        : "conflict",
    order: toStoredOrder(record),
  };
}

function toRecord(
  order: Pick<
    StoredOrder,
    | "id"
    | "command"
    | "requestFingerprint"
    | "status"
    | "providerShipmentId"
    | "awb"
    | "failureCode"
    | "failureMessage"
    | "createdAt"
    | "updatedAt"
  >,
): StoredOrderRecord {
  return {
    id: order.id,
    orderId: order.command.orderId,
    courierPartner: order.command.courierPartner,
    serviceType: order.command.serviceType,
    paymentMode: order.command.paymentMode,
    requestFingerprint: order.requestFingerprint,
    command: order.command,
    status: order.status,
    providerShipmentId: order.providerShipmentId ?? null,
    awb: order.awb ?? null,
    failureCode: order.failureCode ?? null,
    failureMessage: order.failureMessage ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function toStoredOrder(record: StoredOrderRecord): StoredOrder {
  return {
    id: record.id,
    orderId: record.orderId,
    courierPartner: record.courierPartner,
    serviceType: record.serviceType,
    paymentMode: record.paymentMode,
    requestFingerprint: record.requestFingerprint,
    command: record.command,
    status: record.status,
    ...(record.providerShipmentId === null
      ? {}
      : { providerShipmentId: record.providerShipmentId }),
    ...(record.awb === null ? {} : { awb: record.awb }),
    ...(record.failureCode === null ? {} : { failureCode: record.failureCode }),
    ...(record.failureMessage === null
      ? {}
      : { failureMessage: record.failureMessage }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "P2002"
  );
}
