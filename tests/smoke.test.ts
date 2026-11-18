import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerPodyardTools, TOOLS } from "../src/tools";

/** A Podyard-shaped stub just for construction; the smoke test only
 * needs the server to come up and list its tools. */
function stubClient() {
  return {
    pods: {
      create: async () => ({}),
      get: async () => ({}),
      list: async () => ({}),
      delete: async () => undefined,
      exec: async () => ({}),
      fs: {
        read: async () => new Uint8Array(0),
        write: async () => undefined,
        delete: async () => undefined,
        // Mirrors the real SDK: fs.list throws synchronously (501).
        list: () => {
          throw new Error("501 not_implemented");
        },
      },
      snapshot: async () => ({}),
      listSnapshots: async () => ({}),
      fork: async () => ({ children: [] }),
      sleep: async () => ({}),
      wake: async () => ({}),
    },
    snapshots: {
      get: async () => ({}),
      fork: async () => ({ children: [] }),
    },
    templates: {
      list: async () => ({}),
      get: async () => ({}),
      create: async () => ({}),
      delete: async () => undefined,
    },
    usage: { list: async () => ({}) },
    limits: { get: async () => ({}) },
    webhooks: {
      list: async () => ({}),
      get: async () => ({}),
      create: async () => ({}),
      delete: async () => undefined,
    },
    keys: {
      list: async () => ({}),
      create: async () => ({}),
      revoke: async () => undefined,
    },
    async *execStream() {
      // no-op generator for the stub
    },
  } as never;
}

describe("MCP smoke", () => {
  it("registers every documented tool on the server", () => {
    const server = new McpServer({ name: "podyard", version: "0.1.0" });
    registerPodyardTools(server, stubClient());
    expect(TOOLS).toHaveLength(29);
  });

  it("tool names match the public docs table", () => {
    const documented = [
      "podyard_create_pod",
      "podyard_exec",
      "podyard_exec_stream",
      "podyard_fs_read",
      "podyard_fs_write",
      "podyard_fs_list",
      "podyard_fs_delete",
      "podyard_sleep",
      "podyard_wake",
      "podyard_snapshot",
      "podyard_fork",
      "podyard_destroy",
      "podyard_list_pods",
      "podyard_list_snapshots",
      "podyard_get_snapshot",
      "podyard_list_templates",
      "podyard_get_template",
      "podyard_create_template",
      "podyard_delete_template",
      "podyard_list_webhooks",
      "podyard_get_webhook",
      "podyard_create_webhook",
      "podyard_delete_webhook",
      "podyard_list_keys",
      "podyard_create_key",
      "podyard_revoke_key",
      "podyard_usage",
      "podyard_limits",
      "podyard_get_pod",
    ];
    expect([...TOOLS].sort()).toEqual([...documented].sort());
  });
});
