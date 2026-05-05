# Maple Download Site

Static download page for Maple.

Open `index.html` directly in a browser, or deploy the folder to any static host.

## Local Release File

The page links to the GitHub Release asset:

```text
https://github.com/cwoo1090/maple/releases/download/v0.1.1/Maple_0.1.1_aarch64.dmg
```

The DMG is not committed to git. To refresh the page after a new macOS release build:

```bash
LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 \
  shasum -a 256 ../prototype/app-shell/src-tauri/target/release/bundle/dmg/Maple_0.1.1_aarch64.dmg \
  > downloads/checksums.txt
```

Then update the release URL, visible file size, version, and checksum in `index.html`.
