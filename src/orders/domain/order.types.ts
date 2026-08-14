export type CourierPartner = "mock" | "urbanebolt";
export type ServiceType = "FORWARD" | "REVERSE";
export type PaymentMode = "PREPAID" | "COD";

export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED"
  | "RECONCILIATION_REQUIRED";

export interface Address {
  readonly name: string;
  readonly phone: string;
  readonly email?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface Parcel {
  readonly weightGrams: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly description?: string;
}

export interface Invoice {
  readonly number: string;
  readonly amount: number;
  readonly currency: string;
}

export interface CreateOrderCommand {
  readonly orderId: string;
  readonly courierPartner: CourierPartner;
  readonly serviceType: ServiceType;
  readonly paymentMode: PaymentMode;
  readonly shipper: Address;
  readonly consignee: Address;
  readonly returnAddress?: Address;
  readonly parcel: Parcel;
  readonly invoice: Invoice;
}

export interface StoredOrder {
  readonly id: string;
  readonly orderId: string;
  readonly courierPartner: CourierPartner;
  readonly serviceType: ServiceType;
  readonly paymentMode: PaymentMode;
  readonly requestFingerprint: string;
  readonly command: CreateOrderCommand;
  readonly status: OrderStatus;
  readonly providerShipmentId?: string;
  readonly awb?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
