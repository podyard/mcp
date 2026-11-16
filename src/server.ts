import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { PodyardClientOptions } from "@podyard/sdk";
import { PodyardClient } from "@podyard/sdk";
import { env } from "./env";
import { registerPodyardTools } from "./tools";

export interface PodyardMcpOptions {
  /** Explicit API key. Falls back to `PODYARD_API_KEY` env var. */
  apiKey?: string;
  /** Explicit base URL. Falls back to `PODYARD_BASE_URL` then SDK default. */
  baseUrl?: string;
}

/**
 * Create a configured Podyard MCP server (stdio transport) with all
 * Podyard tools registered.
 */
export function createPodyardMcpServer(
  options: PodyardMcpOptions = {}
): McpServer {
  const clientOptions: PodyardClientOptions = {
    apiKey: options.apiKey ?? env.PODYARD_API_KEY,
    baseUrl: options.baseUrl ?? env.PODYARD_BASE_URL,
  };

  const client = new PodyardClient(clientOptions);
  const server = new McpServer({ name: "podyard", version: "0.1.0" });

  registerPodyardTools(server, client);
  return server;
}

/** Run the Podyard MCP server over stdio. Resolves when the transport closes. */
export async function startPodyardMcpServer(
  options: PodyardMcpOptions = {}
): Promise<void> {
  const server = createPodyardMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
