import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { validateEnvironment } from "./config/environment";
import { HealthModule } from "./health/health.module";
import { OrdersModule } from "./orders/orders.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.body.password",
            "req.body.apiKey",
          ],
          censor: "[REDACTED]",
        },
      },
    }),
    HealthModule,
    OrdersModule,
  ],
  providers: [AllExceptionsFilter],
})
export class AppModule {}
