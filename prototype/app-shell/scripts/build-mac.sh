#!/bin/sh
set -eu

bundles="${1:-app,dmg}"
key_path="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/maple-updater.key}"
script_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
release_env_path="${TAURI_RELEASE_ENV_PATH:-$script_dir/../.env.release.local}"

if [ -f "$release_env_path" ]; then
  set -a
  . "$release_env_path"
  set +a
fi

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

case ",$bundles," in
  *",app,"*|*",dmg,"*)
    if [ -z "${APPLE_API_KEY_PATH:-}" ]; then
      set -- "$HOME"/.appstoreconnect/private_keys/AuthKey_*.p8
      if [ "$#" -eq 1 ] && [ -f "$1" ]; then
        APPLE_API_KEY_PATH="$1"
        export APPLE_API_KEY_PATH
      fi
    fi

    if [ -z "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
      key_file="$(basename "$APPLE_API_KEY_PATH")"
      case "$key_file" in
        AuthKey_*.p8)
          APPLE_API_KEY="${key_file#AuthKey_}"
          APPLE_API_KEY="${APPLE_API_KEY%.p8}"
          export APPLE_API_KEY
          ;;
      esac
    fi

    if { [ -z "${APPLE_API_KEY:-}" ] || [ -z "${APPLE_API_ISSUER:-}" ] || [ -z "${APPLE_API_KEY_PATH:-}" ]; } &&
       { [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; }; then
      echo "Missing Apple notarization credentials." >&2
      echo "Set APPLE_API_KEY, APPLE_API_ISSUER, and APPLE_API_KEY_PATH, or set APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID." >&2
      exit 1
    fi
    ;;
esac

tauri build --bundles "$bundles"

case ",$bundles," in
  *",dmg,"*)
    version="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
    dmg_path="src-tauri/target/release/bundle/dmg/Maple_${version}_aarch64.dmg"

    if [ ! -f "$dmg_path" ]; then
      echo "Missing DMG artifact: $dmg_path" >&2
      exit 1
    fi

    if xcrun stapler validate -q "$dmg_path" >/dev/null 2>&1; then
      echo "DMG notarization ticket already stapled: $dmg_path"
    else
      echo "Notarizing DMG: $dmg_path"
      if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
        xcrun notarytool submit "$dmg_path" \
          --key "$APPLE_API_KEY_PATH" \
          --key-id "$APPLE_API_KEY" \
          --issuer "$APPLE_API_ISSUER" \
          --wait
      else
        xcrun notarytool submit "$dmg_path" \
          --apple-id "$APPLE_ID" \
          --password "$APPLE_PASSWORD" \
          --team-id "$APPLE_TEAM_ID" \
          --wait
      fi
      xcrun stapler staple "$dmg_path"
    fi
    ;;
esac
