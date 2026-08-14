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
});
