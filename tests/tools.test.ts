import { describe, expect, it } from "vitest";
import { registerPodyardTools, TOOLS } from "../src/tools";

/**
 * Build a minimal mock of PodyardClient where each method records its
 * arguments and returns a canned value, or rejects when configured to.
 */
function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      // biome-ignore lint/suspicious/noAssignInExpressions: concise init-or-push pattern
      (calls[name] ??= []).push(args);
      const impl = overrides[name];
      if (impl instanceof Error) {
        return Promise.reject(impl);
      }
      if (typeof impl === "function") {
        return Promise.resolve((impl as (...a: unknown[]) => unknown)(...args));
      }
      return Promise.resolve(impl ?? { [name]: true });
    };

  const client = {
    calls,
    pods: {
      create: record("pods.create"),
      get: record("pods.get"),
      list: record("pods.list"),
      delete: record("pods.delete"),
      exec: record("pods.exec"),
      fs: {
        read: record("pods.fs.read"),
        write: record("pods.fs.write"),
        list: record("pods.fs.list"),
      },
      snapshot: record("pods.snapshot"),
      listSnapshots: record("pods.listSnapshots"),
      fork: record("pods.fork"),
    },
    snapshots: {
      get: record("snapshots.get"),
      fork: record("snapshots.fork"),
    },
    templates: {
      list: record("templates.list"),
      get: record("templates.get"),
      create: record("templates.create"),
    },
    usage: {
      list: record("usage.list"),
    },
    limits: {
      get: record("limits.get"),
    },
  };

  return client as unknown as Parameters<typeof registerPodyardTools>[1];
}

/** Register all tools on a real McpServer without a transport. */
function makeServerWithTools(client: ReturnType<typeof makeClient>) {
  // Import inside the test so the McpServer class is available.
  return import("@modelcontextprotocol/sdk/server/mcp.js").then(
    ({ McpServer }) => {
      const server = new McpServer({ name: "test", version: "0.0.0" });
      registerPodyardTools(server, client);
      return server;
    }
  );
}

/**
 * Invoke a registered tool's handler by name, mirroring what the MCP
 * CallTool request handler does internally.
 */
async function callTool(
  server: Awaited<ReturnType<typeof makeServerWithTools>>,
  name: string,
  args: Record<string, unknown>
) {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (a: Record<string, unknown>, e: unknown) => unknown }
      >;
    }
  )._registeredTools;
  const entry = tools[name];
  if (!entry) {
    throw new Error(`tool not registered: ${name}`);
  }
  // Await even though the result is a promise: the tool handlers are async.
  const result = entry.handler(args, {});
  return await result;
}

describe("registerPodyardTools", () => {
  it("exposes the documented tool names", () => {
    expect(TOOLS).toEqual(
      expect.arrayContaining([
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
      ])
    );
    expect(TOOLS).toHaveLength(17);
  });

  it("creates the server without a transport and no API key requirement", async () => {
    const client = makeClient();
    const server = await makeServerWithTools(client);
    expect(server).toBeDefined();
  });
});

describe("tool behavior", () => {
  it("podyard_create_pod forwards name, templateId and metadata", async () => {
    const client = makeClient({
      "pods.create": { id: "pod_1", name: "x", status: "running" },
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_create_pod", {
      name: "x",
      templateId: "tpl_1",
      metadata: { a: 1 },
    });
    expect(client.calls["pods.create"][0]).toEqual([
      { name: "x", templateId: "tpl_1", metadata: { a: 1 } },
    ]);
    expect((res as any).content[0].text).toContain("pod_1");
    expect((res as any).isError).toBeUndefined();
  });

  it("podyard_destroy calls pods.delete and reports the destroyed id", async () => {
    const client = makeClient({ "pods.delete": undefined });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_destroy", { podId: "pod_9" });
    expect(client.calls["pods.delete"][0]).toEqual(["pod_9"]);
    expect(JSON.parse((res as any).content[0].text)).toEqual({
      destroyed: "pod_9",
    });
  });

  it("podyard_exec forwards the full ExecRequest", async () => {
    const client = makeClient({
      "pods.exec": {
        exitCode: 0,
        stdout: "hi",
        stderr: "",
        durationMs: 5,
        stdoutBytes: 2,
        stderrBytes: 0,
      },
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_exec", {
      podId: "pod_1",
      argv: ["ls", "-la"],
      cwd: "/tmp",
      env: { A: "1" },
      timeoutSeconds: 30,
    });
    expect(client.calls["pods.exec"][0]).toEqual([
      "pod_1",
      { argv: ["ls", "-la"], cwd: "/tmp", env: { A: "1" }, timeoutSeconds: 30 },
    ]);
    expect(JSON.parse((res as any).content[0].text).exitCode).toBe(0);
  });

  it("podyard_exec surfaces SDK errors as isError results", async () => {
    const client = makeClient({
      "pods.exec": new Error("Podyard API error: pod not found"),
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_exec", {
      podId: "pod_404",
      argv: ["true"],
    });
    expect((res as any).isError).toBe(true);
    expect((res as any).content[0].text).toContain("pod not found");
  });

  it("podyard_fs_read decodes bytes as UTF-8 text", async () => {
    const client = makeClient({
      "pods.fs.read": new TextEncoder().encode("hello pod"),
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_fs_read", {
      podId: "pod_1",
      path: "/tmp/hello.txt",
    });
    const body = JSON.parse((res as any).content[0].text);
    expect(body).toMatchObject({
      path: "/tmp/hello.txt",
      encoding: "utf-8",
      sizeBytes: 9,
      content: "hello pod",
    });
  });

  it("podyard_fs_list surfaces the honest 501 as an error result", async () => {
    // The real SDK's fs.list throws PodyardError(501) synchronously; the
    // tool's try/catch converts that into an isError MCP result.
    const client = makeClient();
    client.pods.fs.list = ((...args: unknown[]) => {
      client.calls["pods.fs.list"] ??= [];
      client.calls["pods.fs.list"].push(args);
      throw new Error(
        "not_implemented: Directory listing is not yet supported. Coming soon."
      );
    }) as typeof client.pods.fs.list;
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_fs_list", {
      podId: "pod_1",
      path: "/tmp",
    });
    expect((res as any).isError).toBe(true);
    expect((res as any).content[0].text).toContain("not_implemented");
    expect(client.calls["pods.fs.list"][0]).toEqual(["pod_1", "/tmp"]);
  });

  it("podyard_fork validates that a source is provided", async () => {
    const client = makeClient();
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_fork", { count: 2 });
    expect((res as any).isError).toBe(true);
    expect(client.calls["snapshots.fork"]).toBeUndefined();
    expect(client.calls["pods.fork"]).toBeUndefined();
  });

  it("podyard_fork routes to snapshots.fork when snapshotId is given", async () => {
    const client = makeClient({
      "snapshots.fork": { children: [{ id: "pod_a" }, { id: "pod_b" }] },
    });
    const server = await makeServerWithTools(client);
    await callTool(server, "podyard_fork", { snapshotId: "snap_1", count: 2 });
    expect(client.calls["snapshots.fork"][0]).toEqual(["snap_1", { count: 2 }]);
  });

  it("podyard_fork routes to pods.fork when podId is given", async () => {
    const client = makeClient({
      "pods.fork": { children: [{ id: "pod_c" }] },
    });
    const server = await makeServerWithTools(client);
    await callTool(server, "podyard_fork", { podId: "pod_1" });
    expect(client.calls["pods.fork"][0]).toEqual([
      "pod_1",
      { count: undefined },
    ]);
  });

  it("podyard_limits calls limits.get with no arguments", async () => {
    const client = makeClient({
      "limits.get": { plan: "free", used: {}, limits: {} },
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_limits", {});
    expect(client.calls["limits.get"][0]).toEqual([]);
    expect(JSON.parse((res as any).content[0].text).plan).toBe("free");
  });

  it("podyard_usage forwards pagination params", async () => {
    const client = makeClient({
      "usage.list": { items: [], hasMore: false, next: null },
    });
    const server = await makeServerWithTools(client);
    await callTool(server, "podyard_usage", { cursor: "c1", limit: 5 });
    expect(client.calls["usage.list"][0]).toEqual([{ cursor: "c1", limit: 5 }]);
  });
});
