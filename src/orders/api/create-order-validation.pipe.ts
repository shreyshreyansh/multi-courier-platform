import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate, type ValidationError } from "class-validator";

import { CreateOrderDto } from "./create-order.dto";

@Injectable()
export class CreateOrderValidationPipe implements PipeTransform<
  unknown,
  Promise<CreateOrderDto>
> {
  public async transform(value: unknown): Promise<CreateOrderDto> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new BadRequestException({
        message: ["body must be a JSON object"],
        error: "Bad Request",
      });
    }

    const dto = plainToInstance(CreateOrderDto, value);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: flattenValidationErrors(errors),
        error: "Bad Request",
      });
    }

    return dto;
  }
}

function flattenValidationErrors(
  errors: readonly ValidationError[],
  prefix = "",
): readonly string[] {
  return errors.flatMap((error) => {
    const field =
      prefix.length === 0 ? error.property : `${prefix}.${error.property}`;
    const messages =
      error.constraints === undefined ? [] : Object.values(error.constraints);
    const nested =
      error.children === undefined
        ? []
        : flattenValidationErrors(error.children, field);

    return [...messages.map((message) => `${field}: ${message}`), ...nested];
  });
}
