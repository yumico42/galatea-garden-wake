const MAX_STDIN_BYTES = 64 * 1024;

export function validateEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("injector envelope must be an object");
  }
  if (value.version !== 1 || value.type !== "garden_wake") {
    throw new Error("unsupported injector envelope");
  }
  // Match the upstream v1 protocol and preserve forward-compatible reasons.
  if (
    typeof value.reason !== "string" ||
    value.reason.length === 0 ||
    value.reason.length > 128 ||
    value.reason.trim() !== value.reason
  ) {
    throw new Error("invalid wake reason");
  }
  if (
    typeof value.message !== "string" ||
    value.message.trim().length === 0 ||
    value.message.length > 4096
  ) {
    throw new Error("invalid wake message");
  }
  return {
    version: 1,
    type: "garden_wake",
    reason: value.reason,
    message: value.message,
  };
}

export function validateGatewayUrl(rawUrl, allowInsecure = false) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("GATEWAY_WAKE_URL must be an absolute URL");
  }
  const privateHttp =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".zeabur.internal") ||
      allowInsecure);
  if (url.protocol !== "https:" && !privateHttp) {
    throw new Error("gateway URL must use HTTPS outside an approved private network");
  }
  if (url.username || url.password) {
    throw new Error("gateway URL must not contain credentials");
  }
  return url;
}

export async function readEnvelopeFromStdin(stream) {
  stream.setEncoding("utf8");
  let body = "";
  for await (const chunk of stream) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > MAX_STDIN_BYTES) {
      throw new Error("injector input is too large");
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(body.trim());
  } catch {
    throw new Error("injector input must be valid JSON");
  }
  return validateEnvelope(parsed);
}

export async function postEnvelope({
  envelope,
  gatewayUrl,
  secret,
  timeoutMs = 10_000,
  fetchImpl = globalThis.fetch,
}) {
  if (!secret) {
    throw new Error("GATEWAY_WAKE_SECRET is required");
  }
  const response = await fetchImpl(gatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": "garden-wake-gateway-injector/1",
      "X-Garden-Bridge-Secret": secret,
    },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(Number(timeoutMs) || 10_000, 60_000))),
  });
  if (!response.ok) {
    throw new Error(`gateway rejected wake delivery with HTTP ${response.status}`);
  }
  return response.status;
}
