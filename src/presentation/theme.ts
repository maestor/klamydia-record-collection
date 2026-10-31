import { createHash } from "node:crypto";

// Trusted application code only: keep the pre-paint script and its CSP hash together.
export const themeBootstrap =
	'try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}';

export const themeBootstrapHash = `sha256-${createHash("sha256").update(themeBootstrap).digest("base64")}`;
