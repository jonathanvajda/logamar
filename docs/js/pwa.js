const installButton = document.querySelector("#install-app");
const offlineStatus = document.querySelector("#offline-status");
const updateNotice = document.querySelector("#pwa-update");
const updateButton = document.querySelector("#update-app");
const dialog = document.querySelector("#install-help");
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let installPrompt;

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (installButton && !standalone()) installButton.hidden = false;
});
addEventListener("appinstalled", () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
});
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (installButton && isSecureContext && !standalone()) installButton.hidden = false;
if (dialog) {
  dialog.querySelector("#ios-install-steps").hidden = !ios;
  dialog.querySelector("#browser-install-steps").hidden = ios;
}
installButton?.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    installButton.hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome !== "accepted" && !standalone()) installButton.hidden = false;
    } catch {
      installButton.hidden = false;
      dialog?.showModal();
    }
  } else if (dialog) dialog.showModal();
});
document.querySelector("#close-install-help")?.addEventListener("click", () => dialog.close());

if ("serviceWorker" in navigator && isSecureContext) {
  let updateRequested = false;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { updateViaCache: "none" }).then((registration) => {
    const offerUpdate = () => {
      if (updateNotice) updateNotice.hidden = !(registration.waiting && navigator.serviceWorker.controller);
    };
    offerUpdate();
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", offerUpdate);
    });
    updateButton?.addEventListener("click", () => {
      if (!registration.waiting) return;
      updateRequested = true;
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    });
    return navigator.serviceWorker.ready;
  }).then(() => {
    if (offlineStatus) offlineStatus.textContent = "Ready for offline study";
  }).catch(() => {
    if (offlineStatus) offlineStatus.textContent = "Offline setup unavailable";
  });
} else if (offlineStatus) {
  offlineStatus.textContent = "Progress saved on this device";
}
