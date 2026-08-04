import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

function runArm(stateDirectory) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["runtime/arm.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        GARDEN_STATE_DIRECTORY: stateDirectory,
        GARDEN_REQUIRE_PERSISTENT_STATE: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("manual arm is persistent and single-use until consumed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "garden-wake-arm-"));
  try {
    const first = await runArm(directory);
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /exactly one connection/);
    const marker = JSON.parse(await readFile(join(directory, "armed.json"), "utf8"));
    assert.equal(marker.policy, "single-use-manual-arm");

    const second = await runArm(directory);
    assert.equal(second.code, 2);
    assert.match(second.stderr, /already armed/);

    process.env.GARDEN_STATE_DIRECTORY = directory;
    process.env.GARDEN_REQUIRE_PERSISTENT_STATE = "false";
    const state = await import(`../runtime/state.mjs?test=${Date.now()}`);
    assert.equal(await state.consumeArm(), true);
    assert.equal(await state.consumeArm(), false);

    const third = await runArm(directory);
    assert.equal(third.code, 0, third.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
