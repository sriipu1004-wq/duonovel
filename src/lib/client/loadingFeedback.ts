export function showGlobalLoadingFeedback(
  label = "処理中...",
  timeoutMs = 5000
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("libread:loading-feedback", {
      detail: {
        label,
        timeoutMs,
      },
    })
  );
}

export function hideGlobalLoadingFeedback() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("libread:loading-feedback-done"));
}