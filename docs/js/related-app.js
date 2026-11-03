const suggestion = document.querySelector(".related-app");
const dismissButton = document.querySelector(".related-app-dismiss");
const dismissalKey = "logamar:reformanda-dismissed";

try {
  if (localStorage.getItem(dismissalKey) === "1") suggestion.hidden = true;
} catch {
  // The suggestion can still be dismissed for this visit if storage is unavailable.
}

dismissButton?.addEventListener("click", () => {
  suggestion.hidden = true;
  try {
    localStorage.setItem(dismissalKey, "1");
  } catch {
    // Keep the suggestion hidden for this visit.
  }
});
