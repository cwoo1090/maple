const macosDownloadUrl =
  "https://github.com/cwoo1090/maple/releases/download/v0.1.21/Maple_0.1.21_aarch64.dmg";
const macosDownloadName = "Maple_0.1.21_aarch64.dmg";

const statusElement = document.querySelector("#download-status");
const fallbackLink = document.querySelector("#download-fallback");
const downloadMessages = {
  en: {
    starting: (assetName) => `Starting ${assetName}...`,
    didNotStart: "Download did not start? Click here.",
    failed: "Could not start the direct download automatically.",
    latestRelease: "Download directly",
  },
  ko: {
    starting: (assetName) => `${assetName} 다운로드를 시작합니다.`,
    didNotStart: "다운로드가 시작되지 않으면 여기를 클릭하세요.",
    failed: "자동 다운로드를 시작하지 못했습니다.",
    latestRelease: "직접 다운로드",
  },
};

function getDownloadLanguage() {
  return document.documentElement.lang === "ko" ? "ko" : "en";
}

function messageSet() {
  return downloadMessages[getDownloadLanguage()];
}

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function redirectToMacosDownload() {
  try {
    setStatus(messageSet().starting(macosDownloadName));
    if (fallbackLink) {
      fallbackLink.href = macosDownloadUrl;
      fallbackLink.textContent = messageSet().didNotStart;
    }
    window.location.replace(macosDownloadUrl);
  } catch (_error) {
    setStatus(messageSet().failed);
    if (fallbackLink) {
      fallbackLink.href = macosDownloadUrl;
      fallbackLink.textContent = messageSet().latestRelease;
    }
  }
}

redirectToMacosDownload();
