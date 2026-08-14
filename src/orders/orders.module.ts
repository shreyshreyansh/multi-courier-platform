import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";

import { CourierAdapterRegistry } from "../couriers/courier-adapter.registry";
import type { CourierAdapter } from "../couriers/courier-adapter";
import { MockCourierAdapter } from "../couriers/mock-courier.adapter";
import { UrbaneboltAdapter } from "../couriers/urbanebolt.adapter";
import { BatchesController, OrdersController } from "./api/orders.controller";
import { BatchService } from "./application/batch.service";
import {
  OrderService,
  type OrderDispatcher,
} from "./application/order.service";
import type { OrderRepository } from "./domain/order.repository";
import { OrderFulfillmentService } from "./fulfillment/order-fulfillment.service";
import { InProcessOrderDispatcher } from "./fulfillment/in-process-order.dispatcher";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-order.repository";
import {
  adaptPrismaOrderClient,
  PostgresOrderRepository,
} from "./infrastructure/postgres-order.repository";
import { PrismaService } from "./infrastructure/prisma.service";

export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
export const ORDER_DISPATCHER = Symbol("ORDER_DISPATCHER");

@Module({
  controllers: [OrdersController, BatchesController],
  providers: [
    PrismaService,
    {
      provide: ORDER_REPOSITORY,
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
      ): OrderRepository => {
        const persistenceMode = config.getOrThrow<"memory" | "postgres">(
          "PERSISTENCE_MODE",
        );

        return persistenceMode === "postgres"
          ? new PostgresOrderRepository(adaptPrismaOrderClient(prisma))
          : new InMemoryOrderRepository();
      },
      inject: [ConfigService, PrismaService],
    },
    {
      provide: CourierAdapterRegistry,
      useFactory: (config: ConfigService) => {
        const adapters: CourierAdapter[] = [new MockCourierAdapter()];
        const username = config.get<string>("URBANEBOLT_USERNAME");
        const password = config.get<string>("URBANEBOLT_PASSWORD");

        if (username !== undefined && password !== undefined) {
          adapters.push(
            new UrbaneboltAdapter({
              baseUrl: config.getOrThrow<string>("URBANEBOLT_BASE_URL"),
              username,
              password,
              timeoutMs: config.getOrThrow<number>("REQUEST_TIMEOUT_MS"),
            }),
          );
        }

        return new CourierAdapterRegistry(adapters);
      },
      inject: [ConfigService],
    },
    {
      provide: OrderFulfillmentService,
      useFactory: (
        orderRepository: OrderRepository,
        adapters: CourierAdapterRegistry,
      ) => new OrderFulfillmentService(orderRepository, adapters),
      inject: [ORDER_REPOSITORY, CourierAdapterRegistry],
    },
    {
      provide: ORDER_DISPATCHER,
      useFactory: (
        fulfillment: OrderFulfillmentService,
        logger: PinoLogger,
        config: ConfigService,
      ): OrderDispatcher =>
        new InProcessOrderDispatcher(fulfillment, logger, undefined, {
          maxAttempts: config.getOrThrow<number>("DISPATCH_MAX_ATTEMPTS"),
          baseDelayMs: config.getOrThrow<number>(
            "DISPATCH_RETRY_BASE_DELAY_MS",
          ),
        }),
      inject: [OrderFulfillmentService, PinoLogger, ConfigService],
    },
    {
      provide: OrderService,
      useFactory: (
        orderRepository: OrderRepository,
        dispatcher: OrderDispatcher,
      ) => new OrderService(orderRepository, dispatcher),
      inject: [ORDER_REPOSITORY, ORDER_DISPATCHER],
    },
    {
      provide: BatchService,
      useFactory: (orders: OrderService) => new BatchService(orders),
      inject: [OrderService],
    },
  ],
})
export class OrdersModule {}
