import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

describe("validateEnvironment", () => {
  it("treats blank optional UrbaneBolt credentials as unset", () => {
    const environment = validateEnvironment({
      URBANEBOLT_USERNAME: "",
      URBANEBOLT_PASSWORD: "",
    });

    expect(environment.URBANEBOLT_USERNAME).toBeUndefined();
    expect(environment.URBANEBOLT_PASSWORD).toBeUndefined();
  });

  it("requires both UrbaneBolt credentials when either is configured", () => {
    expect(() =>
      validateEnvironment({ URBANEBOLT_USERNAME: "uat-user" }),
    ).toThrow(
      "URBANEBOLT_USERNAME and URBANEBOLT_PASSWORD must be set together",
    );
  });

  it("requires a database URL only when PostgreSQL persistence is selected", () => {
    expect(() => validateEnvironment({ PERSISTENCE_MODE: "postgres" })).toThrow(
      "DATABASE_URL must be set when PERSISTENCE_MODE is postgres",
    );

    expect(
      validateEnvironment({
        PERSISTENCE_MODE: "postgres",
        DATABASE_URL:
          "postgresql://courier:courier@localhost:5432/courier_platform?schema=public",
      }).PERSISTENCE_MODE,
    ).toBe("postgres");
  });

  it("bounds the in-process dispatch retry policy", () => {
    expect(
      validateEnvironment({
        DISPATCH_MAX_ATTEMPTS: "4",
        DISPATCH_RETRY_BASE_DELAY_MS: "125",
      }),
    ).toMatchObject({
      DISPATCH_MAX_ATTEMPTS: 4,
      DISPATCH_RETRY_BASE_DELAY_MS: 125,
    });

    expect(() => validateEnvironment({ DISPATCH_MAX_ATTEMPTS: 0 })).toThrow(
      "DISPATCH_MAX_ATTEMPTS: Number must be greater than or equal to 1",
    );
  });
});
