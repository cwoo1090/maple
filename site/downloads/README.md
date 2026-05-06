# Maple Downloads

Place release builds in this folder when publishing the static site.

The public site uses `download-macos.html` to redirect to the latest GitHub
Release asset matching:

```text
Maple_<version>_aarch64.dmg
```

DMG, ZIP, and app bundle artifacts are intentionally ignored by git so release
binaries do not get committed accidentally.
