import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness probe" })
  @ApiOkResponse({ description: "The API process is accepting requests." })
  public live() {
    return this.healthService.live();
  }
}
