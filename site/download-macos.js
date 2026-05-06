const latestReleaseApi = "https://api.github.com/repos/cwoo1090/maple/releases/latest";
const latestReleasePage = "https://github.com/cwoo1090/maple/releases/latest";
const dmgNamePattern = /^Maple_[0-9]+\.[0-9]+\.[0-9]+_aarch64\.dmg$/;

const statusElement = document.querySelector("#download-status");
const fallbackLink = document.querySelector("#download-fallback");

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

async function redirectToLatestDmg() {
  try {
    const response = await fetch(latestReleaseApi, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`);
    }

    const release = await response.json();
    const asset = release.assets?.find((candidate) =>
      dmgNamePattern.test(candidate.name),
    );

    if (!asset?.browser_download_url) {
      throw new Error("No Apple silicon DMG asset found in the latest release.");
    }

    setStatus(`Starting ${asset.name}...`);
    if (fallbackLink) {
      fallbackLink.href = asset.browser_download_url;
      fallbackLink.textContent = "Download did not start? Click here.";
    }
    window.location.replace(asset.browser_download_url);
  } catch (_error) {
    setStatus("Could not start the direct download automatically.");
    if (fallbackLink) {
      fallbackLink.href = latestReleasePage;
      fallbackLink.textContent = "Open latest release";
    }
  }
}

redirectToLatestDmg();
