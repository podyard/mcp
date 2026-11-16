import { z } from "zod";

/**
 * Zod schemas for the Podyard MCP server environment.
 *
 * Kept in a dedicated module so they can be imported and reused (e.g. by
 * tests, tooling, or a future HTTP transport) without pulling in
 * `createEnv`. All `process.env` variables flow from these schemas via
 * `env.ts`.
 */

/** Pattern for a valid Podyard API key. */
const API_KEY_PATTERN = /^pyd_(live|test)_[A-Za-z0-9]+_[A-Za-z0-9]+$/;

/** Podyard API key. Format: `pyd_live_<id>_<secret>` or `pyd_test_<id>_<secret>`. */
export const apiKeySchema = z
  .string()
  .min(1, "PODYARD_API_KEY is required")
  .refine((v) => API_KEY_PATTERN.test(v), {
    message:
      "PODYARD_API_KEY must look like pyd_live_<id>_<secret> or pyd_test_<id>_<secret>",
  });

/** Optional override for the Podyard API base URL. */
export const baseUrlSchema = z
  .string()
  .url("PODYARD_BASE_URL must be a valid URL")
  .optional();

/**
 * The full server-side env schema for the MCP process.
 *
 * `env.ts` passes this object directly to `createEnv({ server: serverSchema })`.
 * The inferred type is the parsed shape of every variable.
 */
export const serverSchema = {
  PODYARD_API_KEY: apiKeySchema,
  PODYARD_BASE_URL: baseUrlSchema,
  /** Set to `"true"` to bypass validation (used in tests / CI). */
  SKIP_ENV_VALIDATION: z.string().optional(),
} as const;

/** Inferred parsed type of {@link serverSchema}. */
export type ServerEnv = {
  [K in keyof typeof serverSchema]: z.infer<(typeof serverSchema)[K]>;
};
