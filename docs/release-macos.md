# macOS Release Checklist

Maple's first publish path should be a direct-download `.dmg`. The Mac App Store can come later after the app is proven outside the sandbox.

## Manual Apple Setup

- Apple Developer Program membership is active.
- Agreements are accepted.
- Team ID: `7UK3MMC4SB`.
- Developer ID Application certificate is installed in Keychain:
  - `Developer ID Application: chulwoo ahn (7UK3MMC4SB)`
- Do not commit certificates, private keys, App Store Connect API keys, app-specific passwords, or notarization credentials.

## Local Build Checks

Run these before release packaging:

```bash
cd prototype/operation-runner
node --test

cd ../app-shell
npm run build
cd src-tauri
cargo test
```

For a full signed app bundle check:

```bash
cd prototype/app-shell
export APPLE_SIGNING_IDENTITY="Developer ID Application: chulwoo ahn (7UK3MMC4SB)"
npm run build:mac:app
```

The bundled app should appear under:

```text
prototype/app-shell/src-tauri/target/release/bundle/macos/Maple.app
```

## Direct Download DMG

Build a Developer ID signed DMG:

```bash
cd prototype/app-shell
export APPLE_SIGNING_IDENTITY="Developer ID Application: chulwoo ahn (7UK3MMC4SB)"
npm run build:mac:dmg
```

The npm script sets `LC_ALL=en_US.UTF-8` and `LANG=en_US.UTF-8` because the DMG helper uses macOS Perl, which can fail under unsupported `C.UTF-8` shell locales.

The DMG should appear under:

```text
prototype/app-shell/src-tauri/target/release/bundle/dmg/
```

## Signing And Notarization

Keep signing credentials local. Prefer environment variables or Keychain profiles over committed config.

Verify the signed DMG and the app inside it:

```bash
hdiutil verify prototype/app-shell/src-tauri/target/release/bundle/dmg/Maple_0.1.0_aarch64.dmg

rm -rf /tmp/maple-dmg-mount
mkdir -p /tmp/maple-dmg-mount
hdiutil attach -nobrowse -readonly -mountpoint /tmp/maple-dmg-mount \
  prototype/app-shell/src-tauri/target/release/bundle/dmg/Maple_0.1.0_aarch64.dmg
codesign --verify --deep --strict --verbose=2 /tmp/maple-dmg-mount/Maple.app
hdiutil detach /tmp/maple-dmg-mount
```

For notarization, create an App Store Connect API key or store credentials with `notarytool`:

```bash
xcrun notarytool store-credentials "Maple Notary"
```

Then submit the DMG:

```bash
xcrun notarytool submit path/to/Maple_0.1.0_aarch64.dmg \
  --keychain-profile "Maple Notary" \
  --wait
```

Staple the accepted notarization ticket:

```bash
xcrun stapler staple path/to/Maple_0.1.0_aarch64.dmg
xcrun stapler validate path/to/Maple_0.1.0_aarch64.dmg
```

Before notarization, `spctl` may reject the DMG with `source=Insufficient Context`. That is expected for a signed-but-not-notarized Developer ID build.

## Release Notes

Before uploading:

- Open `Maple.app` from Finder, not Terminal.
- Create or open a workspace under `~/Documents/Maple Wikis`.
- Confirm Provider Setup can find Node.js, npm, Codex, and Claude where installed.
- Confirm Build wiki can run using the bundled `operation-runner` resource.
- Confirm no source files are modified by Build wiki.
- Confirm Undo last operation restores generated wiki changes.

## Mac App Store Later

The Mac App Store path needs separate sandbox work. Maple currently relies on local workspace folders and local AI CLIs, so do not reuse the direct-download entitlements for App Store submission without a dedicated sandbox pass.
