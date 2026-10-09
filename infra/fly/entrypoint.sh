#!/bin/sh
set -eu

if [ "${DATA_DIR:-/data}" != "/data" ] || [ -L /data ] || ! mountpoint -q /data; then
  printf '%s\n' 'Mount a persistent volume at /data before starting the backend.' >&2
  exit 1
fi
if [ "$(id -u)" != "0" ]; then
  printf '%s\n' 'The volume initialization entrypoint must start as root.' >&2
  exit 1
fi
# Never dereference a symlink in user-created files while repairing ownership.
find /data -xdev ! -user node -exec chown --no-dereference node:node {} +
chmod 750 /data
exec gosu node /app/infra/fly/start.sh
