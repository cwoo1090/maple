# Maple Download Site

Static download page for Maple.

Open `index.html` directly in a browser, or deploy the folder to any static host.

Production URL:

```text
https://maple-taupe.vercel.app
```

## Latest Release Download

The main download CTA links to `download-macos.html`. That page reads the latest
GitHub Release and redirects to the first Apple silicon DMG asset matching:

```text
Maple_<version>_aarch64.dmg
```

This keeps the public CTA stable while still downloading the newest versioned
DMG file directly.

The DMG is not committed to git. To refresh checksum notes after a new macOS
release build:

```bash
LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 \
  shasum -a 256 ../prototype/app-shell/src-tauri/target/release/bundle/dmg/Maple_0.1.1_aarch64.dmg \
  > downloads/checksums.txt
```

The site download link does not need to change when a new release is published
with the same DMG naming pattern.
