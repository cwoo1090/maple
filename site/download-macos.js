const latestReleaseApi = "https://api.github.com/repos/cwoo1090/maple/releases/latest";
const latestReleasePage = "https://github.com/cwoo1090/maple/releases/latest";
const dmgNamePattern = /^Maple_[0-9]+\.[0-9]+\.[0-9]+_aarch64\.dmg$/;

const statusElement = document.querySelector("#download-status");
const fallbackLink = document.querySelector("#download-fallback");
const downloadMessages = {
  en: {
    starting: (assetName) => `Starting ${assetName}...`,
    didNotStart: "Download did not start? Click here.",
    failed: "Could not start the direct download automatically.",
    latestRelease: "Open latest release",
  },
  ko: {
    starting: (assetName) => `${assetName} 다운로드를 시작합니다.`,
    didNotStart: "다운로드가 시작되지 않으면 여기를 클릭하세요.",
    failed: "자동 다운로드를 시작하지 못했습니다.",
    latestRelease: "GitHub 릴리스 열기",
  },
};

function currentLanguage() {
  return document.documentElement.lang === "ko" ? "ko" : "en";
}

function messageSet() {
  return downloadMessages[currentLanguage()];
}

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

    setStatus(messageSet().starting(asset.name));
    if (fallbackLink) {
      fallbackLink.href = asset.browser_download_url;
      fallbackLink.textContent = messageSet().didNotStart;
    }
    window.location.replace(asset.browser_download_url);
  } catch (_error) {
    setStatus(messageSet().failed);
    if (fallbackLink) {
      fallbackLink.href = latestReleasePage;
      fallbackLink.textContent = messageSet().latestRelease;
    }
  }
}

redirectToLatestDmg();
