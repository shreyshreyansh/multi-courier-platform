import { createHash } from "node:crypto";

import type { CreateOrderCommand } from "./order.types";

type CanonicalValue =
  | boolean
  | null
  | number
  | string
  | readonly CanonicalValue[]
  | CanonicalObject;
interface CanonicalObject {
  readonly [key: string]: CanonicalValue;
}

export function fingerprintOrderRequest(command: CreateOrderCommand): string {
  const canonical = canonicalize(command) as CanonicalObject;
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }

  throw new Error(`Cannot fingerprint unsupported value type: ${typeof value}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
