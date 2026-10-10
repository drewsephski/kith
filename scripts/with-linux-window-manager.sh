#!/usr/bin/env bash
set -euo pipefail

: "${DISPLAY:?Run this command inside xvfb-run}"
command -v openbox >/dev/null
command -v xprop >/dev/null
wm_log="$(mktemp)"
openbox --sm-disable >"$wm_log" 2>&1 &
wm_pid=$!
cleanup() {
  kill "$wm_pid" 2>/dev/null || true
  wait "$wm_pid" 2>/dev/null || true
  cat "$wm_log"
  rm -f "$wm_log"
}
trap cleanup EXIT

# Xvfb provides a display, not native window-management semantics. Wait for the
# actual EWMH supporting window and its identity before exercising minimize.
ready=false
for ((attempt = 0; attempt < 100; attempt++)); do
  if ! kill -0 "$wm_pid" 2>/dev/null; then
    echo "Openbox exited before becoming ready." >&2
    exit 1
  fi
  wm_window="$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | sed -nE 's/.*window id # (0x[0-9a-f]+).*/\1/p')" || wm_window=""
  if [[ -n "$wm_window" && "$wm_window" != "0x0" ]] &&
    xprop -id "$wm_window" _NET_WM_NAME | grep -Fq Openbox &&
    xprop -root _NET_SUPPORTED | grep -Fq _NET_WM_STATE_HIDDEN; then
    ready=true
    break
  fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  echo "Openbox did not advertise native minimize capabilities." >&2
  exit 1
fi
xprop -root _NET_SUPPORTING_WM_CHECK _NET_SUPPORTED
"$@"
