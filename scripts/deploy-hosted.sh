#!/usr/bin/env bash
set -euo pipefail
: "${EXPECTED_SHA:?}"
: "${FLY_APP:?}"
: "${HOSTED_ORIGIN:?}"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$FLY_APP" =~ ^kith[a-z0-9-]*$ ]]
test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"
test -z "$(git status --porcelain --untracked-files=no)"

# Reject known authentication incompatibility before changing the running image.
curl --fail --silent --show-error --max-time 30 \
  "$HOSTED_ORIGIN/api/auth/capabilities" | jq -e ' .passwordAuth == false or .passwordReset == true' >/dev/null

# Capture the exact prior image for operator rollback. Never replace volumes,
# rotate secrets, destroy Machines, or roll database migrations backwards.
status="$(flyctl status --app "$FLY_APP" --json)"
previous="$(jq -er '.Machines | if length == 1 then .[0].image_ref | .registry + "/" + .repository + "@" + .digest else error("expected one persistent Machine") end' <<< "$status")"
printf 'Previous immutable backend image: `%s`\n' "$previous" >> "$GITHUB_STEP_SUMMARY"
flyctl deploy . --app "$FLY_APP" --config infra/fly/fly.toml \
  --dockerfile infra/fly/Dockerfile --ignorefile .dockerignore \
  --build-arg "GIT_SHA=$EXPECTED_SHA" --ha=false --remote-only

# Fly's public liveness check is insufficient: inspect the API on loopback and
# the supervised worker in the same immutable image, without printing logs or env.
flyctl ssh console --app "$FLY_APP" --command \
  "node /app/scripts/verify-hosted-runtime.mjs $EXPECTED_SHA"
curl --fail --silent --show-error --retry 5 --retry-all-errors \
  --max-time 30 "$HOSTED_ORIGIN/health" | jq -e '.ok == true' >/dev/null
curl --fail --silent --show-error --max-time 30 \
  "$HOSTED_ORIGIN/api/auth/capabilities" | jq -e '.passwordAuth == false or .passwordReset == true' >/dev/null
printf 'Verified hosted API and worker source: `%s`.\n' "$EXPECTED_SHA" >> "$GITHUB_STEP_SUMMARY"
