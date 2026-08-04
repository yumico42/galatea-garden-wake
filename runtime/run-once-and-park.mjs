#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";

import {
  assertPersistentState,
  consumeArm,
  runtimePath,
  stateDirectory,
  writeJsonAtomic,
} from "./state.mjs";

const port = Number.parseInt(process.env.PORT ?? "8080", 10) || 8080;
const state = {
  status: "starting",
  startedAt: new Date().toISOString(),
  bridgeStartedAt: null,
  bridgeStoppedAt: null,
  exitCode: null,
  signal: null,
  policy: "persistent-single-use-manual-arm",
};

let child = null;
let shuttingDown = false;

function publicState() {
  return { service: "galatea-garden-wake-zeabur", ...state };
}

async function persistState() {
  try {
    await writeJsonAtomic(runtimePath, publicState());
  } catch (error) {
    process.stderr.write(`Cannot persist supervisor state: ${error.message}\n`);
  }
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (path !== "/" && path !== "/health" && path !== "/status") {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not found" }));
    return;
  }
  // Deliberately remain healthy after the bridge stops.  Exiting PID 1 would
  // let an orchestrator create an automated Garden reconnection loop.
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(publicState()));
});

function park(reason) {
  if (state.status === "stopped" || shuttingDown) return;
  state.status = "stopped";
  state.bridgeStoppedAt = new Date().toISOString();
  void persistState();
  process.stderr.write(
    `Garden bridge stopped (${reason}). It will NOT restart automatically. ` +
      "Fix the cause, run check manually, then restart this Zeabur service once.\n",
  );
}

function startBridgeOnce() {
  state.status = "running";
  state.bridgeStartedAt = new Date().toISOString();
  void persistState();
  child = spawn(process.execPath, ["/app/dist/cli.js", "run"], {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.once("error", (error) => {
    state.exitCode = 2;
    park(`spawn error: ${error.code ?? error.name}`);
  });
  child.once("close", (code, signal) => {
    state.exitCode = Number.isInteger(code) ? code : null;
    state.signal = signal ?? null;
    child = null;
    if (!shuttingDown) park(`exit=${code ?? "none"} signal=${signal ?? "none"}`);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  state.status = "shutting_down";
  await persistState();
  if (child && !child.killed) child.kill("SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8_000).unref();
  process.stderr.write(`Supervisor received ${signal}; shutting down.\n`);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(port, "0.0.0.0", async () => {
  process.stdout.write(`Local supervisor health server listening on ${port}.\n`);
  try {
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    await assertPersistentState();
    if (!(await consumeArm())) {
      state.status = "not_armed";
      await persistState();
      process.stdout.write(
        "Garden bridge is parked. Run `node /app/runtime/arm.mjs`, then manually restart once.\n",
      );
      return;
    }
    startBridgeOnce();
  } catch (error) {
    state.status = "blocked";
    state.bridgeStoppedAt = new Date().toISOString();
    await persistState();
    process.stderr.write(`Garden bridge blocked: ${error.message}\n`);
  }
});
