(() => {
  function handleFailure(image) {
    if (!(image instanceof HTMLImageElement) || !image.hasAttribute("data-image-fallback")) return;
    if (image.dataset.fallbackLabel) {
      const label = document.createElement("span");
      label.className = "image-failure";
      label.textContent = image.dataset.fallbackLabel;
      image.replaceWith(label);
    } else {
      image.remove();
    }
  }
  document.addEventListener("error", (event) => handleFailure(event.target), true);
  document.querySelectorAll("img[data-image-fallback]").forEach((image) => {
    if (image.complete && image.naturalWidth === 0) handleFailure(image);
  });
})();
