// Pure routing for the local supervisor HTTP server, kept separate so it can be tested.
//
// /live    supervisor process is up. Always 200; the container HEALTHCHECK uses this so an
//          orchestrator never restarts the container (and never reconnects Garden) on its own.
// /health  real bridge state: 200 only while the bridge is running, 503 otherwise
//          (not_armed, stopped, blocked, starting, shutting_down). For monitoring only.
// /status  full state, always 200 (informational).
// /        same as /status.

export const HEALTHY_STATUSES = new Set(["running"]);

export function routeSupervisorRequest(path, state) {
  const healthy = HEALTHY_STATUSES.has(state.status);
  switch (path) {
    case "/live":
      return { code: 200, body: { live: true, status: state.status } };
    case "/health":
      return { code: healthy ? 200 : 503, body: { healthy, ...state } };
    case "/":
    case "/status":
      return { code: 200, body: { healthy, ...state } };
    default:
      return { code: 404, body: { error: "not found" } };
  }
}
