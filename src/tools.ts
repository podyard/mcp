import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PodyardClient } from "@podyard/sdk";
import { z } from "zod";

const POD_ID = z.string().describe("Podyard pod ID, e.g. pod_01HXYZ...");
const SNAPSHOT_ID = z
  .string()
  .describe("Podyard snapshot ID, e.g. snap_01HXYZ...");
const TEMPLATE_ID = z
  .string()
  .describe("Podyard template ID, e.g. tpl_01HXYZ...");
const CURSOR = z
  .string()
  .optional()
  .describe("Opaque cursor from a previous page's `next`.");
const LIMIT = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Max items to return.");

const ok = (
  data: unknown
): { content: Array<{ type: "text"; text: string }> } => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const fail = (
  error: unknown
): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} => {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return {
    content: [{ type: "text" as const, text: `Podyard error: ${message}` }],
    isError: true,
  };
};

/**
 * The full list of tool names exposed by this server. Kept as a constant so
 * tests and docs can assert against it without spinning up a transport.
 */
export const TOOLS = [
  "podyard_create_pod",
  "podyard_get_pod",
  "podyard_list_pods",
  "podyard_destroy",
  "podyard_exec",
  "podyard_fs_read",
  "podyard_fs_write",
  "podyard_fs_list",
  "podyard_snapshot",
  "podyard_list_snapshots",
  "podyard_get_snapshot",
  "podyard_fork",
  "podyard_list_templates",
  "podyard_get_template",
  "podyard_create_template",
  "podyard_usage",
  "podyard_limits",
] as const;

/**
 * Register all Podyard tools on an MCP server. Tools map 1:1 onto the
 * Podyard API verbs (which map 1:1 onto engine verbs); nothing is invented.
 */
export function registerPodyardTools(
  server: McpServer,
  client: PodyardClient
): void {
  // ------------------------------------------------------------------
  // Pods
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_create_pod",
    {
      title: "Create pod",
      description:
        "Create a new Podyard sandbox pod, optionally from a template. " +
        "The pod starts running immediately.",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe("Human-readable pod name. Defaults to 'untitled'."),
        templateId: z
          .string()
          .optional()
          .describe(
            "Create the pod from this template instead of the default image."
          ),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Arbitrary metadata stored with the pod."),
      },
    },
    async (args) => {
      try {
        const pod = await client.pods.create({
          name: args.name,
          templateId: args.templateId,
          metadata: args.metadata,
        });
        return ok(pod);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_get_pod",
    {
      title: "Get pod",
      description: "Get details of a single Podyard pod by ID.",
      inputSchema: { podId: POD_ID },
    },
    async (args) => {
      try {
        const pod = await client.pods.get(args.podId);
        return ok(pod);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_list_pods",
    {
      title: "List pods",
      description:
        "List Podyard pods visible to this API key, with cursor pagination.",
      inputSchema: {
        cursor: CURSOR,
        limit: LIMIT,
      },
    },
    async (args) => {
      try {
        const res = await client.pods.list({
          cursor: args.cursor,
          limit: args.limit,
        });
        return ok(res);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_destroy",
    {
      title: "Destroy pod",
      description:
        "Destroy a Podyard pod and free its resources. This is irreversible.",
      inputSchema: { podId: POD_ID },
    },
    async (args) => {
      try {
        await client.pods.delete(args.podId);
        return ok({ destroyed: args.podId });
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------------
  // Exec
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_exec",
    {
      title: "Run command",
      description:
        "Run a command inside a Podyard pod and return stdout, stderr, and the exit code. " +
        "Use `timeoutSeconds` to bound long-running commands.",
      inputSchema: {
        podId: POD_ID,
        argv: z
          .array(z.string())
          .min(1)
          .describe(
            'Command to run, e.g. ["python3", "-m", "http.server", "8000"]'
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory inside the pod."),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe("Extra environment variables for the command."),
        timeoutSeconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Kill the command after this many seconds."),
      },
    },
    async (args) => {
      try {
        const result = await client.pods.exec(args.podId, {
          argv: args.argv,
          cwd: args.cwd,
          env: args.env,
          timeoutSeconds: args.timeoutSeconds,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------------
  // Filesystem
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_fs_read",
    {
      title: "Read file",
      description:
        "Read a file from a Podyard pod's filesystem and return its content.",
      inputSchema: {
        podId: POD_ID,
        path: z
          .string()
          .describe("File path inside the pod, e.g. /tmp/out.txt"),
      },
    },
    async (args) => {
      try {
        const bytes = await client.pods.fs.read(args.podId, args.path);
        const content = Buffer.from(bytes).toString("utf-8");
        return ok({
          path: args.path,
          encoding: "utf-8",
          sizeBytes: bytes.byteLength,
          content,
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_fs_write",
    {
      title: "Write file",
      description:
        "Write a file to a Podyard pod's filesystem, creating parent directories as needed.",
      inputSchema: {
        podId: POD_ID,
        path: z.string().describe("File path inside the pod, e.g. /tmp/in.txt"),
        content: z.string().describe("File content as UTF-8 text."),
      },
    },
    async (args) => {
      try {
        await client.pods.fs.write(args.podId, args.path, args.content);
        return ok({
          written: args.path,
          sizeBytes: Buffer.byteLength(args.content, "utf-8"),
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_fs_list",
    {
      title: "List directory",
      description:
        "List directory contents inside a Podyard pod. " +
        "Note: not yet supported by the engine — returns a 501 error (Coming soon).",
      inputSchema: {
        podId: POD_ID,
        path: z.string().describe("Directory path inside the pod, e.g. /tmp"),
      },
    },
    (args) => {
      try {
        // The SDK's fs.list throws PodyardError (501 not_implemented)
        // synchronously — directory listing is not yet supported by the
        // engine. The catch below surfaces it as an MCP error result.
        client.pods.fs.list(args.podId, args.path);
        return ok({ path: args.path, entries: [] });
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------------
  // Snapshots
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_snapshot",
    {
      title: "Create snapshot",
      description: "Snapshot a running Podyard pod to preserve its state.",
      inputSchema: {
        podId: POD_ID,
        name: z.string().optional().describe("Name for the snapshot."),
        retain: z
          .boolean()
          .optional()
          .describe(
            "Retain the snapshot beyond the plan's default retention window."
          ),
      },
    },
    async (args) => {
      try {
        const snapshot = await client.pods.snapshot(args.podId, {
          name: args.name,
          retain: args.retain,
        });
        return ok(snapshot);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_list_snapshots",
    {
      title: "List snapshots",
      description: "List snapshots of a Podyard pod, with cursor pagination.",
      inputSchema: {
        podId: POD_ID,
        cursor: CURSOR,
        limit: LIMIT,
      },
    },
    async (args) => {
      try {
        const res = await client.pods.listSnapshots(args.podId, {
          cursor: args.cursor,
          limit: args.limit,
        });
        return ok(res);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_get_snapshot",
    {
      title: "Get snapshot",
      description: "Get details of a single Podyard snapshot by ID.",
      inputSchema: { snapshotId: SNAPSHOT_ID },
    },
    async (args) => {
      try {
        const snapshot = await client.snapshots.get(args.snapshotId);
        return ok(snapshot);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------------
  // Fork
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_fork",
    {
      title: "Fork pod or snapshot",
      description:
        "Fork one or more new pods from a snapshot. `count` must be between 1 and 64. " +
        "Use `snapshotId` to fork from a specific snapshot, or `podId` to fork the pod's latest state.",
      inputSchema: {
        snapshotId: SNAPSHOT_ID.optional().describe("Fork from this snapshot."),
        podId: POD_ID.optional().describe(
          "Fork the pod's latest state (uses the pod's implicit snapshot)."
        ),
        count: z
          .number()
          .int()
          .min(1)
          .max(64)
          .optional()
          .describe("Number of pods to fork (1-64). Defaults to 1."),
        argv: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            "Command to run in each forked pod (only used when forking a pod)."
          ),
      },
    },
    async (args) => {
      try {
        if (!(args.snapshotId || args.podId)) {
          return fail(
            new Error("Either snapshotId or podId is required to fork.")
          );
        }
        const res = args.snapshotId
          ? await client.snapshots.fork(args.snapshotId, {
              count: args.count,
            })
          : // args.podId is guaranteed present by the guard above.
            await client.pods.fork(args.podId as string, {
              count: args.count,
              argv: args.argv,
            });
        return ok(res);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------------
  // Templates
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_list_templates",
    {
      title: "List templates",
      description: "List Podyard pod templates, with cursor pagination.",
      inputSchema: {
        cursor: CURSOR,
        limit: LIMIT,
      },
    },
    async (args) => {
      try {
        const res = await client.templates.list({
          cursor: args.cursor,
          limit: args.limit,
        });
        return ok(res);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_get_template",
    {
      title: "Get template",
      description: "Get details of a single Podyard template by ID.",
      inputSchema: { templateId: TEMPLATE_ID },
    },
    async (args) => {
      try {
        const template = await client.templates.get(args.templateId);
        return ok(template);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_create_template",
    {
      title: "Create template",
      description:
        "Create a Podyard pod template from an existing snapshot, for fast pod creation.",
      inputSchema: {
        name: z.string().describe("Template name."),
        snapshotId: SNAPSHOT_ID,
        description: z
          .string()
          .optional()
          .describe("What this template is for."),
        cwd: z
          .string()
          .optional()
          .describe("Default working directory for pods from this template."),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe("Default environment variables."),
        visibility: z
          .enum(["private", "public"])
          .optional()
          .describe("Whether the template is visible beyond your own key."),
      },
    },
    async (args) => {
      try {
        const template = await client.templates.create({
          name: args.name,
          snapshotId: args.snapshotId,
          description: args.description,
          cwd: args.cwd,
          env: args.env,
          visibility: args.visibility,
        });
        return ok(template);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------------
  // Usage & limits
  // ------------------------------------------------------------------

  server.registerTool(
    "podyard_usage",
    {
      title: "Get usage",
      description:
        "Get recent Podyard usage events for this API key, with cursor pagination.",
      inputSchema: {
        cursor: CURSOR,
        limit: LIMIT,
      },
    },
    async (args) => {
      try {
        const res = await client.usage.list({
          cursor: args.cursor,
          limit: args.limit,
        });
        return ok(res);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "podyard_limits",
    {
      title: "Get limits",
      description: "Get the plan limits and current usage for this API key.",
    },
    async () => {
      try {
        const res = await client.limits.get();
        return ok(res);
      } catch (error) {
        return fail(error);
      }
    }
  );
}
