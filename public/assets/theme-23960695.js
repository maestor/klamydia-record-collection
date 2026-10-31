"use strict";
const themeKey = "theme";
let theme = "system";
const deviceTheme = window.matchMedia("(prefers-color-scheme: dark)");
function currentTheme() {
    return theme === "system" ? (deviceTheme.matches ? "dark" : "light") : theme;
}
try {
    const saved = localStorage.getItem(themeKey);
    if (saved === "light" || saved === "dark")
        theme = saved;
}
catch {
    // The device preference still works when storage is unavailable.
}
function applyTheme() {
    if (theme === "system")
        delete document.documentElement.dataset.theme;
    else
        document.documentElement.dataset.theme = theme;
}
applyTheme();
document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".theme-switch");
    const labels = { light: "vaalea", dark: "tumma" };
    function updateButton() {
        for (const button of buttons) {
            button.setAttribute("aria-label", `Teema: ${labels[currentTheme()]}. Vaihda teemaa`);
            button.title = `Teema: ${labels[currentTheme()]}`;
        }
    }
    updateButton();
    deviceTheme.addEventListener("change", updateButton);
    for (const button of buttons) {
        button.hidden = false;
        button.addEventListener("click", () => {
            theme = currentTheme() === "light" ? "dark" : "light";
            try {
                localStorage.setItem(themeKey, theme);
            }
            catch {
                // Keep the choice for this page when storage is unavailable.
            }
            applyTheme();
            updateButton();
        });
    }
});
