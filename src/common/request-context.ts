import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export interface RequestWithContext extends Request {
  requestId?: string;
}

const allowedRequestId = /^[A-Za-z0-9._-]{1,128}$/;

export function requestContextMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  const suppliedRequestId = request.header("x-request-id");
  const requestId =
    suppliedRequestId !== undefined && allowedRequestId.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
