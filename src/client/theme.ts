const themeKey = "theme";
type Theme = "system" | "light" | "dark";
let theme: Theme = "system";
const deviceTheme = window.matchMedia("(prefers-color-scheme: dark)");
function currentTheme(): "light" | "dark" {
	return theme === "system" ? (deviceTheme.matches ? "dark" : "light") : theme;
}
const saved = document.documentElement.dataset.theme;
if (saved === "light" || saved === "dark") theme = saved;
document.addEventListener("DOMContentLoaded", () => {
	const buttons = document.querySelectorAll<HTMLButtonElement>(".theme-switch");
	const navigation = document.querySelector<HTMLElement>(
		"nav[data-light-label]",
	);
	if (!navigation) return;
	const { lightLabel, darkLabel, lightTitle, darkTitle } = navigation.dataset;
	if (!lightLabel || !darkLabel || !lightTitle || !darkTitle) return;
	const labels = {
		light: { title: lightTitle, label: lightLabel },
		dark: { title: darkTitle, label: darkLabel },
	};
	function updateButton() {
		const { title, label } = labels[currentTheme()];
		for (const button of buttons) {
			button.setAttribute("aria-label", label);
			button.title = title;
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
			} catch {
				// Keep the choice for this page when storage is unavailable.
			}
			document.documentElement.dataset.theme = theme;
			updateButton();
		});
	}
});
