import assert from "node:assert/strict";
import test from "node:test";

import {
  postEnvelope,
  validateEnvelope,
  validateGatewayUrl,
} from "../injectors/gateway-injector-lib.mjs";

const envelope = {
  version: 1,
  type: "garden_wake",
  reason: "game_turn_required",
  message: "轮到你了。",
};

test("validates the v1 injector envelope", () => {
  assert.deepEqual(validateEnvelope(envelope), envelope);
  assert.throws(() => validateEnvelope({ ...envelope, version: 2 }));
  assert.equal(
    validateEnvelope({ ...envelope, reason: "future reason 名称" }).reason,
    "future reason 名称",
  );
  assert.throws(() => validateEnvelope({ ...envelope, reason: " padded " }));
});

test("allows HTTPS and Zeabur private HTTP only", () => {
  assert.equal(validateGatewayUrl("https://gateway.example/wake").protocol, "https:");
  assert.equal(
    validateGatewayUrl("http://mcp-gateway.zeabur.internal:10000/internal/garden/wake").protocol,
    "http:",
  );
  assert.throws(() => validateGatewayUrl("http://gateway.example/wake"));
});

test("posts with the dedicated secret and exact envelope", async () => {
  let request;
  const status = await postEnvelope({
    envelope,
    gatewayUrl: new URL("https://gateway.example/internal/garden/wake"),
    secret: "test-secret",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return { ok: true, status: 202 };
    },
  });
  assert.equal(status, 202);
  assert.equal(request.init.headers.Authorization, "Bearer test-secret");
  assert.deepEqual(JSON.parse(request.init.body), envelope);
});

test("treats non-2xx responses as injector failures", async () => {
  await assert.rejects(
    postEnvelope({
      envelope,
      gatewayUrl: new URL("https://gateway.example/internal/garden/wake"),
      secret: "test-secret",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /HTTP 503/,
  );
});
