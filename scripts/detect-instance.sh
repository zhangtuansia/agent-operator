#!/usr/bin/env bash

# This script is sourced by `npm/bun run electron:dev`.
# It auto-detects multi-instance setups from the current folder name.
#
# Example:
#   .../agent-operator-2  -> instance=2
#
# It only sets env vars when:
# 1) an instance suffix is detected, and
# 2) the corresponding env var is not already provided by the user.

repo_name="$(basename "$PWD")"
instance=""

if [[ "$repo_name" =~ -([0-9]+)$ ]]; then
  instance="${BASH_REMATCH[1]}"
fi

# No instance suffix detected: keep defaults untouched.
if [[ -z "$instance" ]]; then
  return 0 2>/dev/null || exit 0
fi

# Instance number
if [[ -z "${OPERATOR_INSTANCE_NUMBER:-}" ]]; then
  export OPERATOR_INSTANCE_NUMBER="$instance"
fi
if [[ -z "${COWORK_INSTANCE_NUMBER:-}" ]]; then
  export COWORK_INSTANCE_NUMBER="$instance"
fi

# Vite port: base 5173 + instance number (e.g. instance=2 => 5175)
if [[ -z "${OPERATOR_VITE_PORT:-}" && -z "${COWORK_VITE_PORT:-}" ]]; then
  auto_port="$((5173 + instance))"
  export OPERATOR_VITE_PORT="$auto_port"
  export COWORK_VITE_PORT="$auto_port"
fi

# Deep link scheme: agentoperator{n} for side-by-side dev instances
if [[ -z "${OPERATOR_DEEPLINK_SCHEME:-}" && -z "${COWORK_DEEPLINK_SCHEME:-}" ]]; then
  auto_scheme="agentoperator${instance}"
  export OPERATOR_DEEPLINK_SCHEME="$auto_scheme"
  export COWORK_DEEPLINK_SCHEME="$auto_scheme"
fi

# Config dir isolation (avoid instances sharing runtime state by default)
if [[ -z "${OPERATOR_CONFIG_DIR:-}" && -z "${COWORK_CONFIG_DIR:-}" ]]; then
  auto_config_dir="${HOME}/.cowork-${instance}"
  export OPERATOR_CONFIG_DIR="$auto_config_dir"
  export COWORK_CONFIG_DIR="$auto_config_dir"
fi

echo "[detect-instance] instance=${instance} port=${COWORK_VITE_PORT:-${OPERATOR_VITE_PORT:-5173}} scheme=${COWORK_DEEPLINK_SCHEME:-${OPERATOR_DEEPLINK_SCHEME:-agentoperator}}"

