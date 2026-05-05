import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appShellRoot = join(__dirname, "..");
const packageJson = JSON.parse(await readFile(join(appShellRoot, "package.json"), "utf8"));

const repo = process.env.MAPLE_RELEASE_REPO || "cwoo1090/maple";
const tag = process.env.MAPLE_RELEASE_TAG || `v${packageJson.version}`;
const target = process.env.MAPLE_RELEASE_TARGET || "darwin-aarch64";
const bundleName = process.env.MAPLE_UPDATE_BUNDLE || "Maple.app.tar.gz";
const bundleDir = join(appShellRoot, "src-tauri", "target", "release", "bundle", "macos");
const bundlePath = join(bundleDir, bundleName);
const signaturePath = `${bundlePath}.sig`;
const outputPath = join(bundleDir, "latest.json");

await access(bundlePath);
const signature = (await readFile(signaturePath, "utf8")).trim();

const latest = {
  version: packageJson.version,
  notes: process.env.MAPLE_RELEASE_NOTES || `Maple ${packageJson.version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    [target]: {
      signature,
      url: `https://github.com/${repo}/releases/download/${tag}/${bundleName}`,
    },
  },
};

await writeFile(outputPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(outputPath);
