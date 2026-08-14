import { z } from "zod";

const optionalNonBlankString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30_000)
      .default(8_000),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    URBANEBOLT_BASE_URL: z.string().url().default("https://uat.urbanebolt.in"),
    URBANEBOLT_USERNAME: optionalNonBlankString,
    URBANEBOLT_PASSWORD: optionalNonBlankString,
  })
  .superRefine((environment, context) => {
    const hasUsername = environment.URBANEBOLT_USERNAME !== undefined;
    const hasPassword = environment.URBANEBOLT_PASSWORD !== undefined;

    if (hasUsername !== hasPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "URBANEBOLT_USERNAME and URBANEBOLT_PASSWORD must be set together",
        path: ["URBANEBOLT_USERNAME"],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const parsed = environmentSchema.safeParse(config);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");

    throw new Error(`Invalid environment configuration: ${errors}`);
  }

  return parsed.data;
}
