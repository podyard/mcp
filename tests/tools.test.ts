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
        delete: record("pods.fs.delete"),
      },
      snapshot: record("pods.snapshot"),
      listSnapshots: record("pods.listSnapshots"),
      fork: record("pods.fork"),
      sleep: record("pods.sleep"),
      wake: record("pods.wake"),
    },
    snapshots: {
      get: record("snapshots.get"),
      fork: record("snapshots.fork"),
    },
    templates: {
      list: record("templates.list"),
      get: record("templates.get"),
      create: record("templates.create"),
      delete: record("templates.delete"),
    },
    usage: {
      list: record("usage.list"),
    },
    limits: {
      get: record("limits.get"),
    },
    webhooks: {
      list: record("webhooks.list"),
      get: record("webhooks.get"),
      create: record("webhooks.create"),
      delete: record("webhooks.delete"),
    },
    keys: {
      list: record("keys.list"),
      create: record("keys.create"),
      revoke: record("keys.revoke"),
    },
    execStream: record("execStream"),
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
        "podyard_fs_delete",
        "podyard_sleep",
        "podyard_wake",
        "podyard_snapshot",
        "podyard_list_snapshots",
        "podyard_get_snapshot",
        "podyard_fork",
        "podyard_list_templates",
        "podyard_get_template",
        "podyard_create_template",
        "podyard_delete_template",
        "podyard_exec_stream",
        "podyard_list_webhooks",
        "podyard_get_webhook",
        "podyard_create_webhook",
        "podyard_delete_webhook",
        "podyard_list_keys",
        "podyard_create_key",
        "podyard_revoke_key",
        "podyard_usage",
        "podyard_limits",
      ])
    );
    expect(TOOLS).toHaveLength(29);
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

  it("podyard_fs_delete calls pods.fs.delete and reports the path", async () => {
    const client = makeClient({ "pods.fs.delete": undefined });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_fs_delete", {
      podId: "pod_1",
      path: "/tmp/tmp.txt",
    });
    expect(client.calls["pods.fs.delete"][0]).toEqual([
      "pod_1",
      "/tmp/tmp.txt",
    ]);
    expect(JSON.parse((res as any).content[0].text)).toEqual({
      deleted: "/tmp/tmp.txt",
    });
  });

  it("podyard_sleep and podyard_wake call the pod lifecycle methods", async () => {
    const client = makeClient({
      "pods.sleep": { id: "pod_1", status: "sleeping" },
      "pods.wake": { id: "pod_1", status: "running" },
    });
    const server = await makeServerWithTools(client);
    const sleepRes = await callTool(server, "podyard_sleep", {
      podId: "pod_1",
    });
    const wakeRes = await callTool(server, "podyard_wake", { podId: "pod_1" });
    expect(client.calls["pods.sleep"][0]).toEqual(["pod_1"]);
    expect(JSON.parse((sleepRes as any).content[0].text).status).toBe(
      "sleeping"
    );
    expect(client.calls["pods.wake"][0]).toEqual(["pod_1"]);
    expect(JSON.parse((wakeRes as any).content[0].text).status).toBe("running");
  });

  it("podyard_delete_template calls templates.delete", async () => {
    const client = makeClient({ "templates.delete": undefined });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_delete_template", {
      templateId: "tpl_1",
    });
    expect(client.calls["templates.delete"][0]).toEqual(["tpl_1"]);
    expect(JSON.parse((res as any).content[0].text)).toEqual({
      deleted: "tpl_1",
    });
  });

  it("podyard_exec_stream collects NDJSON events into a result", async () => {
    const events = [
      { type: "stdout", data: "hello " },
      { type: "stderr", data: "warn\n" },
      { type: "stdout", data: "world" },
      { type: "exit", exitCode: 0 },
    ];
    const client = makeClient();
    // The real SDK's execStream returns an async generator directly (not a
    // promise), so bypass the `record` wrapper which would wrap it in a promise.
    client.execStream = async function* (_id: string, _input: unknown) {
      client.calls["execStream"] ??= [];
      client.calls["execStream"].push([_id, _input]);
      for (const ev of events) {
        yield ev;
      }
    } as typeof client.execStream;
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_exec_stream", {
      podId: "pod_1",
      argv: ["echo", "world"],
    });
    expect(client.calls["execStream"][0]).toEqual([
      "pod_1",
      {
        argv: ["echo", "world"],
        cwd: undefined,
        env: undefined,
        timeoutSeconds: undefined,
      },
    ]);
    const body = JSON.parse((res as any).content[0].text);
    expect(body).toEqual({
      exitCode: 0,
      stdout: "hello world",
      stderr: "warn\n",
      streamed: true,
    });
  });

  it("podyard_create_webhook forwards url, events and active", async () => {
    const client = makeClient({
      "webhooks.create": {
        id: "wh_1",
        url: "https://x.dev/hook",
        active: true,
      },
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_create_webhook", {
      url: "https://x.dev/hook",
      events: ["pod.created"],
      active: true,
    });
    expect(client.calls["webhooks.create"][0]).toEqual([
      { url: "https://x.dev/hook", events: ["pod.created"], active: true },
    ]);
    expect(JSON.parse((res as any).content[0].text).id).toBe("wh_1");
  });

  it("podyard_delete_webhook calls webhooks.delete", async () => {
    const client = makeClient({ "webhooks.delete": undefined });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_delete_webhook", {
      webhookId: "wh_1",
    });
    expect(client.calls["webhooks.delete"][0]).toEqual(["wh_1"]);
    expect(JSON.parse((res as any).content[0].text)).toEqual({
      deleted: "wh_1",
    });
  });

  it("podyard_list_keys calls keys.list with no arguments", async () => {
    const client = makeClient({
      "keys.list": { items: [{ id: "key_1", label: "ci" }], hasMore: false },
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_list_keys", {});
    expect(client.calls["keys.list"][0]).toEqual([]);
    expect(JSON.parse((res as any).content[0].text).items[0].id).toBe("key_1");
  });

  it("podyard_create_key forwards label and kind", async () => {
    const client = makeClient({
      "keys.create": { id: "key_2", key: "pyd_test_ab_cd", label: "ci" },
    });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_create_key", {
      label: "ci",
      kind: "test",
    });
    expect(client.calls["keys.create"][0]).toEqual([
      { label: "ci", kind: "test" },
    ]);
    expect(JSON.parse((res as any).content[0].text).key).toBe("pyd_test_ab_cd");
  });

  it("podyard_revoke_key calls keys.revoke", async () => {
    const client = makeClient({ "keys.revoke": undefined });
    const server = await makeServerWithTools(client);
    const res = await callTool(server, "podyard_revoke_key", {
      keyId: "key_1",
    });
    expect(client.calls["keys.revoke"][0]).toEqual(["key_1"]);
    expect(JSON.parse((res as any).content[0].text)).toEqual({
      revoked: "key_1",
    });
  });
});
