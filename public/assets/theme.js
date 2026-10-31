"use strict";
const themeKey = "theme";
let theme = "system";
const deviceTheme = window.matchMedia("(prefers-color-scheme: dark)");
function currentTheme() {
    return theme === "system" ? (deviceTheme.matches ? "dark" : "light") : theme;
}
const saved = document.documentElement.dataset.theme;
if (saved === "light" || saved === "dark")
    theme = saved;
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
            document.documentElement.dataset.theme = theme;
            updateButton();
        });
    }
});
