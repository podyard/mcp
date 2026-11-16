# @podyard/mcp

Podyard MCP (Model Context Protocol) server. Exposes the Podyard API to
MCP-capable clients (Claude Desktop, Cursor, OpenCode, any MCP harness) over
stdio.

Every tool maps 1:1 to a Podyard API verb, which maps 1:1 to an engine verb.
Nothing here invents operations.

## Install

```bash
npm i -g @podyard/mcp
```

## Configure

Add to your MCP client config:

```json
{
  "mcpServers": {
    "podyard": {
      "command": "podyard-mcp",
      "env": {
        "PODYARD_API_KEY": "pyd_live_..."
      }
    }
  }
}
```

| Env var            | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `PODYARD_API_KEY`  | Required. Your Podyard API key.                          |
| `PODYARD_BASE_URL` | Optional. Overrides the default API base URL.            |

Environment variables are validated at startup with [zod](https://zod.dev)
via `@t3-oss/env-core` (see `src/env.ts` and `src/schemas.ts`). The API key
must match `pyd_live_<id>_<secret>` or `pyd_test_<id>_<secret>`; the server
exits with a descriptive error if validation fails.

## Tools

| Tool                       | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `podyard_create_pod`       | Create a pod (optionally from a template)                         |
| `podyard_get_pod`          | Get a pod by ID                                                   |
| `podyard_list_pods`        | List pods with cursor pagination                                  |
| `podyard_destroy`          | Destroy a pod                                                     |
| `podyard_exec`             | Run a command, returns stdout/stderr/exit code                    |
| `podyard_fs_read`          | Read a file from the pod's filesystem                             |
| `podyard_fs_write`         | Write a file to the pod's filesystem                              |
| `podyard_fs_list`          | List a directory — **Coming soon** (engine gap, returns 501)      |
| `podyard_snapshot`         | Take a snapshot of a pod                                          |
| `podyard_list_snapshots`   | List snapshots of a pod                                           |
| `podyard_get_snapshot`     | Get a snapshot by ID                                              |
| `podyard_fork`             | Fork 1–64 pods from a snapshot or a pod's current state           |
| `podyard_list_templates`   | List templates                                                    |
| `podyard_get_template`     | Get a template by ID                                              |
| `podyard_create_template`  | Create a template from a snapshot                                 |
| `podyard_usage`            | Get usage events for this API key                                 |
| `podyard_limits`           | Get plan limits and current usage for this API key                |

## Local development (before `@podyard/sdk` is published)

Until `@podyard/sdk` is published to npm, this repo depends on it via a
packed tarball of the sibling `podyard-sdk` repo:

```jsonc
// package.json
"@podyard/sdk": "file:../podyard-sdk/podyard-sdk-0.1.0.tgz"
```

On a fresh clone, pack the SDK once before installing:

```bash
cd ../podyard-sdk && pnpm install && pnpm run build && npm pack
cd ../podyard-mcp && pnpm install
```

Once `@podyard/sdk` is published, switch the dependency to `^0.1.0` and
remove the tarball.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
