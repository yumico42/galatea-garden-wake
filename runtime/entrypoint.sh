#!/usr/bin/env sh
set -eu

mkdir -p /data/garden-wake
chown -R node:node /data
exec gosu node node /app/runtime/run-once-and-park.mjs
