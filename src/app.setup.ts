import { ValidationPipe, type INestApplication } from "@nestjs/common";
import helmet from "helmet";

import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { requestContextMiddleware } from "./common/request-context";

export const API_PREFIX = "api/v1";

export function configureHttpApplication(app: INestApplication): void {
  app.use(helmet());
  app.use(requestContextMiddleware);
  app.enableCors({ origin: false });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(app.get(AllExceptionsFilter));
}
