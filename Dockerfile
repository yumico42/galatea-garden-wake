FROM node:20-bookworm-slim AS bridge-build

ARG BRIDGE_REPOSITORY=https://github.com/WenXiaoWendy/galatea-garden-wake-bridge.git
# Pin a reviewed fail-closed revision. Update deliberately after reviewing upstream.
ARG BRIDGE_REF=f0cd9c2

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone "${BRIDGE_REPOSITORY}" /src \
    && cd /src \
    && git checkout --detach "${BRIDGE_REF}"

WORKDIR /src
RUN npm ci \
    && npm run typecheck \
    && npm test \
    && npm prune --omit=dev


FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    GARDEN_BASE_URL=https://wake-v1.abysslumina.com \
    GARDEN_INJECTOR_EXECUTABLE=node \
    GARDEN_INJECTOR_ARGS_JSON="[\"/app/injectors/gateway-injector.mjs\"]" \
    GARDEN_INJECTOR_WORKING_DIRECTORY=/app \
    GARDEN_STATE_DIRECTORY=/data/garden-wake \
    GARDEN_REQUIRE_PERSISTENT_STATE=true

WORKDIR /app

COPY --from=bridge-build --chown=node:node /src/dist ./dist
COPY --from=bridge-build --chown=node:node /src/package.json /src/package-lock.json ./
COPY --from=bridge-build --chown=node:node /src/node_modules ./node_modules
COPY --chown=node:node injectors ./injectors
COPY --chown=node:node runtime ./runtime

RUN mkdir -p /data/garden-wake \
    && chown -R node:node /data \
    && chmod +x /app/runtime/entrypoint.sh

EXPOSE 8080

# This checks only the local supervisor. It never probes or reconnects Garden.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/runtime/entrypoint.sh"]
