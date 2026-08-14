import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsArray,
  IsInt,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import type {
  Address,
  CourierPartner,
  CreateOrderCommand,
  PaymentMode,
  ServiceType,
} from "../domain/order.types";

export const COURIER_PARTNERS = ["mock", "urbanebolt"] as const;
export const SERVICE_TYPES = ["FORWARD", "REVERSE"] as const;
export const PAYMENT_MODES = ["PREPAID", "COD"] as const;

export class AddressDto implements Address {
  @ApiProperty({ example: "Ada Lovelace" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @ApiProperty({ example: "+919900000002" })
  @IsPhoneNumber(undefined)
  public phone!: string;

  @ApiPropertyOptional({ example: "ada@example.com" })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  public email?: string;

  @ApiProperty({ example: "42 Computing Lane" })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  public addressLine1!: string;

  @ApiPropertyOptional({ example: "Block B" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public addressLine2?: string;

  @ApiProperty({ example: "Mumbai" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  public city!: string;

  @ApiProperty({ example: "Maharashtra" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  public state!: string;

  @ApiProperty({ example: "400001" })
  @IsString()
  @Matches(/^[A-Za-z0-9 -]{3,12}$/)
  public postalCode!: string;

  @ApiProperty({ example: "IN" })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  public country!: string;
}

export class ParcelDto {
  @ApiProperty({ example: 750, description: "Weight in grams." })
  @IsInt()
  @Min(1)
  public weightGrams!: number;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  public lengthCm!: number;

  @ApiProperty({ example: 15 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  public widthCm!: number;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  public heightCm!: number;

  @ApiPropertyOptional({ example: "Books" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public description?: string;
}

export class InvoiceDto {
  @ApiProperty({ example: "INV-1001" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public number!: string;

  @ApiProperty({ example: 1299 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  public amount!: number;

  @ApiProperty({ example: "INR" })
  @IsISO4217CurrencyCode()
  public currency!: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: "ORDER-1001" })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/)
  public orderId!: string;

  @ApiProperty({ enum: COURIER_PARTNERS, example: "mock" })
  @IsIn(COURIER_PARTNERS)
  public courierPartner!: CourierPartner;

  @ApiProperty({ enum: SERVICE_TYPES, example: "FORWARD" })
  @IsIn(SERVICE_TYPES)
  public serviceType!: ServiceType;

  @ApiProperty({ enum: PAYMENT_MODES, example: "PREPAID" })
  @IsIn(PAYMENT_MODES)
  public paymentMode!: PaymentMode;

  @ApiProperty({ type: () => AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  public shipper!: AddressDto;

  @ApiProperty({ type: () => AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  public consignee!: AddressDto;

  @ApiPropertyOptional({ type: () => AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  public returnAddress?: AddressDto;

  @ApiProperty({ type: () => ParcelDto })
  @ValidateNested()
  @Type(() => ParcelDto)
  public parcel!: ParcelDto;

  @ApiProperty({ type: () => InvoiceDto })
  @ValidateNested()
  @Type(() => InvoiceDto)
  public invoice!: InvoiceDto;
}

export class BulkCreateOrdersDto {
  @ApiProperty({
    type: () => CreateOrderDto,
    isArray: true,
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  public orders!: CreateOrderDto[];
}

export function toCreateOrderCommand(dto: CreateOrderDto): CreateOrderCommand {
  return {
    orderId: dto.orderId,
    courierPartner: dto.courierPartner,
    serviceType: dto.serviceType,
    paymentMode: dto.paymentMode,
    shipper: dto.shipper,
    consignee: dto.consignee,
    ...(dto.returnAddress === undefined
      ? {}
      : { returnAddress: dto.returnAddress }),
    parcel: dto.parcel,
    invoice: dto.invoice,
  };
}
