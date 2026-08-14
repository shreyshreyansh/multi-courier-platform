import { Injectable } from "@nestjs/common";

export interface LiveHealth {
  readonly status: "ok";
  readonly service: "multi-courier-platform";
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  public live(now: Date = new Date()): LiveHealth {
    return {
      status: "ok",
      service: "multi-courier-platform",
      timestamp: now.toISOString(),
    };
  }
}
