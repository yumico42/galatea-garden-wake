#!/usr/bin/env node

import { mkdir } from "node:fs/promises";

import {
  armPath,
  assertPersistentState,
  pathExists,
  readJson,
  runtimePath,
  stateDirectory,
  writeJsonAtomic,
} from "./state.mjs";

try {
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await assertPersistentState();
  const runtime = await readJson(runtimePath);
  if (runtime?.status === "running" || runtime?.status === "starting") {
    throw new Error("bridge is already running; stop and diagnose it before arming again");
  }
  if (await pathExists(armPath)) {
    throw new Error("bridge is already armed for one start");
  }
  await writeJsonAtomic(armPath, {
    armedAt: new Date().toISOString(),
    policy: "single-use-manual-arm",
  });
  process.stdout.write(
    "Garden bridge armed for exactly one connection. Restart this Zeabur service once.\n",
  );
} catch (error) {
  process.stderr.write(`Cannot arm Garden bridge: ${error.message}\n`);
  process.exitCode = 2;
}
