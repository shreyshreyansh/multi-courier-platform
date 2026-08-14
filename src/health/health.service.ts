import { Injectable } from "@nestjs/common";

export interface LiveHealth {
  readonly status: "ok";
  readonly service: "multi-courier-platform";
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public live(): LiveHealth {
    return {
      status: "ok",
      service: "multi-courier-platform",
      timestamp: this.now().toISOString(),
    };
  }
}
