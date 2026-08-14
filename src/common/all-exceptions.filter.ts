import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Response } from "express";
import { PinoLogger } from "nestjs-pino";

import { ApplicationError, type ErrorDetail } from "./application-error";
import type { RequestWithContext } from "./request-context";

interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ErrorDetail[];
  };
}

interface NestErrorResponse {
  readonly message?: string | readonly string[];
  readonly error?: string;
}

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  public constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const requestId =
      request.requestId ?? request.header("x-request-id") ?? "unknown";
    const error = this.toApiError(exception, requestId);

    if (error.statusCode >= 500) {
      this.logger.error(
        {
          err: exception,
          requestId,
          statusCode: error.statusCode,
          code: error.body.error.code,
        },
        "Request failed unexpectedly",
      );
    } else {
      this.logger.warn(
        {
          requestId,
          statusCode: error.statusCode,
          code: error.body.error.code,
        },
        "Request rejected",
      );
    }

    response.status(error.statusCode).json(error.body);
  }

  private toApiError(
    exception: unknown,
    requestId: string,
  ): { readonly statusCode: number; readonly body: ApiErrorBody } {
    if (exception instanceof ApplicationError) {
      return {
        statusCode: exception.statusCode,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            requestId,
            ...(exception.details.length > 0
              ? { details: exception.details }
              : {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const nestError =
        typeof response === "string" ? { message: response } : response;
      const details = extractValidationDetails(nestError);

      return {
        statusCode,
        body: {
          error: {
            code: statusCode === 400 ? "VALIDATION_ERROR" : "HTTP_ERROR",
            message:
              statusCode === 400
                ? "Request validation failed."
                : (details[0]?.reason ?? "Request failed."),
            requestId,
            ...(details.length > 0 ? { details } : {}),
          },
        },
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
          requestId,
        },
      },
    };
  }
}

function extractValidationDetails(response: unknown): readonly ErrorDetail[] {
  if (!isNestErrorResponse(response)) {
    return [];
  }

  const messages = response.message;
  if (typeof messages === "string") {
    return [{ reason: messages }];
  }

  if (Array.isArray(messages)) {
    const reasons: readonly unknown[] = messages;
    return reasons
      .filter((reason): reason is string => typeof reason === "string")
      .map((reason) => ({ reason }));
  }

  return response.error === undefined ? [] : [{ reason: response.error }];
}

function isNestErrorResponse(value: unknown): value is NestErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    ("message" in value || "error" in value)
  );
}
