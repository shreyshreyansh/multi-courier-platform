import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import {
  OrderService,
  type CreateOrderResult,
} from "../application/order.service";
import { BatchService, type BatchView } from "../application/batch.service";
import { OrderFulfillmentService } from "../fulfillment/order-fulfillment.service";
import {
  BulkCreateOrdersDto,
  CreateOrderDto,
  toCreateOrderCommand,
} from "./create-order.dto";
import { CreateOrderValidationPipe } from "./create-order-validation.pipe";

interface OrderResponse {
  readonly id: string;
  readonly orderId: string;
  readonly courierPartner: string;
  readonly serviceType: string;
  readonly paymentMode: string;
  readonly status: string;
  readonly providerShipmentId?: string;
  readonly awb?: string;
  readonly failure?: { readonly code?: string; readonly message?: string };
  readonly createdAt: string;
  readonly updatedAt: string;
}

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  public constructor(
    @Inject(OrderService) private readonly orderService: OrderService,
    @Inject(BatchService) private readonly batchService: BatchService,
    @Inject(OrderFulfillmentService)
    private readonly fulfillmentService: OrderFulfillmentService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Submit a normalized order for asynchronous courier dispatch.",
  })
  @ApiAcceptedResponse({
    description: "Order accepted or safely replayed from an identical request.",
  })
  @ApiConflictResponse({
    description: "The order ID was reused with a different payload.",
  })
  public async create(
    @Body(new CreateOrderValidationPipe()) dto: CreateOrderDto,
  ): Promise<{ readonly disposition: string; readonly order: OrderResponse }> {
    const result = await this.orderService.create(toCreateOrderCommand(dto));

    return {
      disposition: result.disposition,
      order: toOrderResponse(result),
    };
  }

  @Post("bulk")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Accept up to 100 normalized orders for asynchronous dispatch.",
  })
  @ApiAcceptedResponse({
    description:
      "Batch accepted with an item-level admission result; courier dispatch continues outside the HTTP request.",
  })
  @ApiBadRequestResponse({
    description:
      "The batch contains fewer than 1 or more than 100 valid orders.",
  })
  public createBulk(@Body() dto: BulkCreateOrdersDto): Promise<BatchView> {
    return this.batchService.create(dto.orders.map(toCreateOrderCommand));
  }

  @Get(":orderId/track")
  @ApiOperation({ summary: "Retrieve the latest normalized order status." })
  @ApiParam({ name: "orderId", example: "ORDER-1001" })
  public track(@Param("orderId") orderId: string) {
    return this.fulfillmentService.track(orderId);
  }

  @Post(":orderId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel an order before delivery." })
  @ApiParam({ name: "orderId", example: "ORDER-1001" })
  public async cancel(
    @Param("orderId") orderId: string,
  ): Promise<OrderResponse> {
    return toOrderResponse({
      disposition: "replayed",
      order: await this.fulfillmentService.cancel(orderId),
    });
  }
}

@ApiTags("batches")
@Controller("batches")
export class BatchesController {
  public constructor(
    @Inject(BatchService) private readonly batchService: BatchService,
  ) {}

  @Get(":batchId")
  @ApiOperation({
    summary: "Retrieve batch admission and current item lifecycle state.",
  })
  @ApiParam({
    name: "batchId",
    example: "a0afab1b-5ed1-470f-8a6d-cf7c7c22e0a1",
  })
  public get(@Param("batchId") batchId: string): Promise<BatchView> {
    return this.batchService.get(batchId);
  }
}

function toOrderResponse(result: CreateOrderResult): OrderResponse {
  const { order } = result;

  return {
    id: order.id,
    orderId: order.orderId,
    courierPartner: order.courierPartner,
    serviceType: order.serviceType,
    paymentMode: order.paymentMode,
    status: order.status,
    ...(order.providerShipmentId === undefined
      ? {}
      : { providerShipmentId: order.providerShipmentId }),
    ...(order.awb === undefined ? {} : { awb: order.awb }),
    ...(order.failureCode === undefined && order.failureMessage === undefined
      ? {}
      : {
          failure: { code: order.failureCode, message: order.failureMessage },
        }),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
