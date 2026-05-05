const checksumButton = document.querySelector("#copy-checksum");
const checksumValue = document.querySelector("#checksum-value");
const copyStatus = document.querySelector("#copy-status");
const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

if (checksumButton && checksumValue && copyStatus) {
  checksumButton.addEventListener("click", async () => {
    const checksum = checksumValue.textContent.trim();

    try {
      await navigator.clipboard.writeText(checksum);
      copyStatus.textContent = "Checksum copied.";
    } catch (_error) {
      copyStatus.textContent = checksum;
    }
  });
}
