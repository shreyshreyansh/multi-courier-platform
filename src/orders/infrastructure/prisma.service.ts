import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  public constructor(@Inject(ConfigService) config: ConfigService) {
    const databaseUrl = config.get<string>("DATABASE_URL");

    super(
      databaseUrl === undefined
        ? undefined
        : { datasources: { db: { url: databaseUrl } } },
    );
  }

  public onModuleDestroy(): Promise<void> {
    return this.$disconnect();
  }
}
