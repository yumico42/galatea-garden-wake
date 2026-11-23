import assert from "node:assert/strict";
import test from "node:test";

import { routeSupervisorRequest } from "../runtime/health.mjs";

const base = { service: "x", policy: "persistent-single-use-manual-arm" };

test("/health is 200 only while the bridge is running", () => {
  assert.equal(routeSupervisorRequest("/health", { ...base, status: "running" }).code, 200);
  for (const status of ["not_armed", "stopped", "blocked", "starting", "shutting_down"]) {
    const result = routeSupervisorRequest("/health", { ...base, status });
    assert.equal(result.code, 503, status);
    assert.equal(result.body.healthy, false);
    assert.equal(result.body.status, status);
  }
});

test("/live stays 200 so the container is never restarted into a reconnect loop", () => {
  for (const status of ["running", "stopped", "blocked", "not_armed"]) {
    assert.equal(routeSupervisorRequest("/live", { ...base, status }).code, 200);
  }
});

test("/status and / are informational and unknown paths 404", () => {
  assert.equal(routeSupervisorRequest("/status", { ...base, status: "stopped" }).code, 200);
  assert.equal(routeSupervisorRequest("/", { ...base, status: "stopped" }).code, 200);
  assert.equal(routeSupervisorRequest("/nope", { ...base, status: "running" }).code, 404);
});
