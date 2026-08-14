import { ApplicationError } from "../common/application-error";
import type { CourierPartner } from "../orders/domain/order.types";

import type { CourierAdapter } from "./courier-adapter";

export class CourierAdapterRegistry {
  private readonly adapters: ReadonlyMap<CourierPartner, CourierAdapter>;

  public constructor(adapters: readonly CourierAdapter[]) {
    this.adapters = new Map(
      adapters.map((adapter) => [adapter.partner, adapter]),
    );
  }

  public get(partner: CourierPartner): CourierAdapter {
    const adapter = this.adapters.get(partner);

    if (adapter === undefined) {
      throw new ApplicationError(
        "COURIER_UNAVAILABLE",
        503,
        `Courier partner ${partner} is not configured.`,
      );
    }

    return adapter;
  }
}
