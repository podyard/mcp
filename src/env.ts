import { createEnv } from "@t3-oss/env-core";
import { serverSchema } from "./schemas";

/**
 * Validated environment for the Podyard MCP server.
 *
 * Every `process.env` variable the server reads flows through here; the
 * actual schemas live in `schemas.ts`.
 */
export const env = createEnv({
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  server: serverSchema,
  clientPrefix: "PUBLIC_",
  client: {},
  runtimeEnv: {
    PODYARD_API_KEY: process.env.PODYARD_API_KEY,
    PODYARD_BASE_URL: process.env.PODYARD_BASE_URL,
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
  },
});
