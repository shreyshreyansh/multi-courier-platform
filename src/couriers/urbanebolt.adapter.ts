import { ApplicationError } from "../common/application-error";
import type { StoredOrder } from "../orders/domain/order.types";

import type {
  CourierAdapter,
  CourierCancelResult,
  CourierDispatchResult,
  CourierTrackingResult,
} from "./courier-adapter";

export interface UrbaneboltConfiguration {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly timeoutMs: number;
}

type FetchFunction = (
  input: URL | string,
  init?: RequestInit,
) => Promise<Response>;

export class UrbaneboltAdapter implements CourierAdapter {
  public readonly partner = "urbanebolt" as const;

  private accessToken?: string;

  public constructor(
    private readonly configuration: UrbaneboltConfiguration,
    private readonly fetchFunction: FetchFunction = fetch,
  ) {}

  public async create(order: StoredOrder): Promise<CourierDispatchResult> {
    const response = await this.authorizedRequest(
      "/api/v1/services/manifest/",
      {
        method: "POST",
        body: JSON.stringify([toManifestRequest(order)]),
      },
    );
    const shipment = firstRecord(response) ?? response;
    const awb =
      findString(shipment, ["awb", "awbNo", "awb_number"]) ??
      `UBE-${order.orderId}`;
    const providerShipmentId =
      findString(shipment, ["shipmentId", "shipment_id", "id"]) ??
      order.orderId;

    return {
      providerShipmentId,
      awb,
      status: "CREATED",
      raw: response,
    };
  }

  public async track(order: StoredOrder): Promise<CourierTrackingResult> {
    if (order.awb === undefined) {
      return {
        orderId: order.orderId,
        status: order.status,
        events: [],
        raw: { reason: "An AWB is not available yet." },
      };
    }

    const response = await this.authorizedRequest(
      `/api/v1/services/tracking-pub/?awb=${encodeURIComponent(order.awb)}`,
      { method: "GET" },
    );
    const tracking = firstRecord(response) ?? response;
    const status = normalizeStatus(
      findString(tracking, ["status", "shipmentStatus", "currentStatus"]),
    );
    const location = findString(tracking, ["location", "currentLocation"]);

    return {
      orderId: order.orderId,
      status,
      awb: order.awb,
      providerShipmentId: order.providerShipmentId,
      events: [
        {
          occurredAt: new Date().toISOString(),
          status,
          message:
            findString(tracking, ["message", "remark", "description"]) ??
            `Urbanebolt status: ${status}.`,
          ...(location === undefined ? {} : { location }),
        },
      ],
      raw: response,
    };
  }

  public async cancel(order: StoredOrder): Promise<CourierCancelResult> {
    if (order.awb === undefined) {
      throw new ApplicationError(
        "CANCELLATION_NOT_AVAILABLE",
        409,
        `Order ${order.orderId} does not yet have an AWB to cancel.`,
      );
    }

    const response = await this.authorizedRequest("/api/v1/services/cancel/", {
      method: "POST",
      body: JSON.stringify({ awbs: [order.awb] }),
    });

    return { status: "CANCELLED", raw: response };
  }

  private async authorizedRequest(
    path: string,
    init: RequestInit,
  ): Promise<Readonly<Record<string, unknown>>> {
    const token = await this.getAccessToken();
    return this.request(path, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken !== undefined) {
      return this.accessToken;
    }

    const response = await this.request("/api/v1/auth/getToken/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: this.configuration.username,
        password: this.configuration.password,
      }),
    });
    const token = findString(response, [
      "token",
      "accessToken",
      "access_token",
    ]);

    if (token === undefined) {
      throw new ApplicationError(
        "COURIER_AUTH_FAILED",
        502,
        "Urbanebolt did not return an access token.",
      );
    }

    this.accessToken = token;
    return token;
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<Readonly<Record<string, unknown>>> {
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      this.configuration.timeoutMs,
    );

    try {
      const response = await this.fetchFunction(
        new URL(path, this.configuration.baseUrl),
        {
          ...init,
          signal: abortController.signal,
        },
      );
      const payload: unknown = await response.json().catch(() => ({}));
      const body = asRecord(payload);

      if (!response.ok) {
        throw new ApplicationError(
          "COURIER_PROVIDER_ERROR",
          502,
          `Urbanebolt request failed with status ${response.status}.`,
        );
      }

      return body;
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Urbanebolt request timed out."
          : "Urbanebolt request could not be completed.";
      throw new ApplicationError("COURIER_REQUEST_FAILED", 502, message);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toManifestRequest(
  order: StoredOrder,
): Readonly<Record<string, unknown>> {
  const { command } = order;

  return {
    orderNumber: command.orderId,
    serviceType: command.serviceType,
    paymentMode: command.paymentMode,
    consigneeName: command.consignee.name,
    consigneePhone: command.consignee.phone,
    consigneeAddress: [
      command.consignee.addressLine1,
      command.consignee.addressLine2,
    ]
      .filter((part): part is string => part !== undefined)
      .join(", "),
    consigneeCity: command.consignee.city,
    consigneeState: command.consignee.state,
    consigneePincode: command.consignee.postalCode,
    consigneeCountry: command.consignee.country,
    productDescription: command.parcel.description ?? command.invoice.number,
    weight: command.parcel.weightGrams / 1_000,
    length: command.parcel.lengthCm,
    width: command.parcel.widthCm,
    height: command.parcel.heightCm,
    invoiceNumber: command.invoice.number,
    invoiceValue: command.invoice.amount,
    currency: command.invoice.currency,
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const data = value.data;

  if (Array.isArray(data)) {
    return asRecord(data[0]);
  }

  return asRecord(data);
}

function findString(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeStatus(
  value: string | undefined,
): CourierTrackingResult["status"] {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("delivered")) return "DELIVERED";
  if (normalized.includes("cancel")) return "CANCELLED";
  if (normalized.includes("pick")) return "PICKED_UP";
  if (normalized.includes("transit") || normalized.includes("shipped"))
    return "IN_TRANSIT";
  if (normalized.includes("fail") || normalized.includes("return"))
    return "FAILED";

  return "CREATED";
}
