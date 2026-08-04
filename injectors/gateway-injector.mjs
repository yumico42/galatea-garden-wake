#!/usr/bin/env node

import {
  postEnvelope,
  readEnvelopeFromStdin,
  validateGatewayUrl,
} from "./gateway-injector-lib.mjs";

async function main() {
  const rawUrl = process.env.GATEWAY_WAKE_URL?.trim() ?? "";
  const secret = process.env.GATEWAY_WAKE_SECRET?.trim() ?? "";
  const allowInsecure = /^(1|true|yes|on)$/i.test(
    process.env.GATEWAY_ALLOW_INSECURE_HTTP?.trim() ?? "",
  );
  const gatewayUrl = validateGatewayUrl(rawUrl, allowInsecure);
  const envelope = await readEnvelopeFromStdin(process.stdin);
  await postEnvelope({
    envelope,
    gatewayUrl,
    secret,
    timeoutMs: process.env.GATEWAY_WAKE_TIMEOUT_MS ?? 10_000,
  });
}

main().catch((error) => {
  // Never print the envelope, message, machine token, or bridge secret.
  process.stderr.write(`gateway injector failed: ${error?.message ?? "unknown error"}\n`);
  process.exitCode = 1;
});
