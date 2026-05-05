#!/bin/sh
set -eu

bundles="${1:-app,dmg}"
key_path="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/maple-updater.key}"

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  if [ ! -f "$key_path" ]; then
    echo "Missing Tauri updater private key: $key_path" >&2
    exit 1
  fi
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$key_path")"
  export TAURI_SIGNING_PRIVATE_KEY
fi

export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD-}"
export LC_ALL="en_US.UTF-8"
export LANG="en_US.UTF-8"

tauri build --bundles "$bundles"
