import { describe, expect, it } from "vitest";

import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  it("accepts an explicit database URL without opening a connection eagerly", async () => {
    const service = new PrismaService({
      get: (key: string) =>
        key === "DATABASE_URL"
          ? "postgresql://courier:courier@localhost:5432/courier_platform?schema=public"
          : undefined,
    } as never);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
