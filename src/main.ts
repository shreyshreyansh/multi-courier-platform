import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { configureHttpApplication } from "./app.setup";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureHttpApplication(app);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("PORT");
  await app.listen(port);
}

void bootstrap();
