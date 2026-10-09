#!/bin/sh
set -eu

# The static image build may allow development defaults; hosted runtime never does.
unset RAKAZO_ALLOW_DEV_SECRETS

: "${DATABASE_URL:?Set the server-side DATABASE_URL secret.}"
: "${BETTER_AUTH_SECRET:?Set the server-side BETTER_AUTH_SECRET secret.}"
: "${ENCRYPTION_KEY:?Set the server-side ENCRYPTION_KEY secret.}"
: "${SCREEN_PROXY_SECRET:?Set the server-side SCREEN_PROXY_SECRET secret.}"
: "${WEB_ORIGIN:?Set WEB_ORIGIN to the public frontend HTTPS origin.}"
: "${BETTER_AUTH_URL:?Set BETTER_AUTH_URL to the public frontend HTTPS origin.}"

if [ -z "${RAKAZO_HOST:-}" ]; then
  : "${FLY_APP_NAME:?Set RAKAZO_HOST when running outside Fly.}"
  export RAKAZO_HOST="${FLY_APP_NAME}.fly.dev"
fi
if [ "$(id -u)" = "0" ]; then
  printf '%s\n' 'Backend services must run without root privileges.' >&2
  exit 1
fi

# Fly release-command Machines cannot access this volume. Migrate before serving;
# Prisma's advisory lock serializes migrations if a restart overlaps deployment.
pnpm db:migrate
exec pnpm start:host
