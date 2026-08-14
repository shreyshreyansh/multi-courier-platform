import { describe, expect, it } from "vitest";

import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports the service as live with an ISO timestamp", () => {
    const service = new HealthService();

    expect(service.live(new Date("2026-08-14T00:00:00.000Z"))).toEqual({
      status: "ok",
      service: "multi-courier-platform",
      timestamp: "2026-08-14T00:00:00.000Z",
    });
  });
});
