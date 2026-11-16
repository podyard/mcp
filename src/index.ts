#!/usr/bin/env node
import { startPodyardMcpServer } from "./server";

await startPodyardMcpServer();

export { registerPodyardTools } from "./tools";
