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

public_health() {
  curl --fail --silent --show-error --max-time 30 "$HOSTED_ORIGIN/health" |
    jq -e '.ok == true' >/dev/null &&
    curl --fail --silent --show-error --max-time 30 "$HOSTED_ORIGIN/api/auth/capabilities" |
    jq -e '.passwordAuth == false or .passwordReset == true' >/dev/null
}

wait_for_acceptance() {
  for ((attempt = 1; attempt <= 5; attempt++)); do
    if "$@"; then return 0; fi
    if ((attempt < 5)); then sleep 3; fi
  done
  return 1
}

rollback_on_failure() {
  local result=$?
  trap - EXIT
  if ((result != 0)); then
    echo "Deployment failed verification; restoring the prior immutable image." >&2
    # Restore application code only. Keep the same Machine, volume, secrets,
    # and forward-applied migrations; releases must remain rollback-compatible.
    if flyctl deploy --app "$FLY_APP" --config infra/fly/fly.toml \
      --image "$previous" --ha=false --update-only --skip-release-command && wait_for_acceptance public_health; then
      echo "Prior backend image restored; public health recovered. Deployment remains failed." >> "$GITHUB_STEP_SUMMARY"
    else
      echo "Rollback failed; operator recovery is required." >&2
      echo "Rollback failed; no recovery is claimed." >> "$GITHUB_STEP_SUMMARY"
    fi
  fi
  exit "$result"
}
# Arm recovery before deploy: a failed command may have partially updated the Machine.
trap rollback_on_failure EXIT
flyctl deploy . --app "$FLY_APP" --config infra/fly/fly.toml \
  --dockerfile infra/fly/Dockerfile --ignorefile .dockerignore \
  --build-arg "GIT_SHA=$EXPECTED_SHA" --ha=false --remote-only

# Fly's public liveness check is insufficient: inspect the API on loopback and
# the supervised worker in the same immutable image, without printing logs or env.
# The supervisor can still be starting after Fly's frontend liveness check passes.
runtime_health() {
  flyctl ssh console --app "$FLY_APP" --command \
    "node /app/scripts/verify-hosted-runtime.mjs $EXPECTED_SHA" && public_health
}
if ! wait_for_acceptance runtime_health; then
  echo "Hosted API or worker did not pass exact-source acceptance." >&2
  exit 1
fi
printf 'Verified hosted API and worker source: `%s`.\n' "$EXPECTED_SHA" >> "$GITHUB_STEP_SUMMARY"
