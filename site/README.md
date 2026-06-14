# Maple Download Site

Static download page for Maple.

Open `index.html` directly in a browser, or deploy the folder to any static host.

Production URL:

```text
https://maple-taupe.vercel.app
```

## macOS Download

The main download CTA links directly to the current Apple silicon DMG on the
GitHub Release:

```text
https://github.com/cwoo1090/maple/releases/download/v0.1.19/Maple_0.1.19_aarch64.dmg
```

The legacy `download-macos.html` page also redirects to that DMG so old links
still start the download.

The DMG is not committed to git. To refresh checksum notes after a new macOS
release build:

```bash
LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 \
  shasum -a 256 ../prototype/app-shell/src-tauri/target/release/bundle/dmg/Maple_0.1.19_aarch64.dmg \
  > downloads/checksums.txt
```

Update the CTA links when a new versioned DMG is published.

## Launch Demo Video

The homepage uses:

```text
assets/maple-launch-demo.mp4
assets/maple-launch-demo-poster.jpg
```

Regenerate the current screenshot-based launch demo with:

```bash
node create-launch-demo-video.mjs
```

This is a lightweight site video built from the checked-in Maple screenshots.
Replace the MP4 and poster with a ScreenStudio export when a live capture is
ready.
