import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import { locale, messages as m } from "#i18n/fi";

type LayoutProps = PropsWithChildren<{
	title: string;
	fullTitle?: string;
	canonical?: string;
	description?: string;
	archive?: boolean;
	gallery?: boolean;
}>;

export const Layout: FC<LayoutProps> = ({
	title,
	fullTitle,
	canonical,
	description,
	archive,
	gallery,
	children,
}) => (
	<>
		{html`<!DOCTYPE html>`}
		<html lang={locale.language}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta
					name="description"
					content={description || m.defaultDescription}
				/>
				<title>{fullTitle || `${title} | Klamydiakokoelma`}</title>
				{canonical && <link rel="canonical" href={canonical} />}
				<link
					rel="icon"
					type="image/png"
					sizes="32x32"
					href="/assets/favicon-32-a3a55586.png"
				/>
				<link
					rel="apple-touch-icon"
					sizes="180x180"
					href="/assets/favicon-180-90da7e65.png"
				/>
				<link rel="stylesheet" href="/assets/style.css" />
				<script src="/assets/theme.js"></script>
				<script src="/assets/images.js" defer></script>
				{gallery && <script src="/assets/gallery.js" defer></script>}
				{archive && (
					<>
						<script src="/assets/htmx-d6fdc75f.js" defer></script>
						<script src="/assets/archive.js" defer></script>
					</>
				)}
			</head>
			<body>
				<header>
					<a href="/">Klamydiakokoelma</a>
					<nav aria-label={m.navigation}>
						<div class="navigation-items desktop-navigation">
							<a href="/archive">{m.archive}</a>
							<a href="/about">{m.about}</a>
							<button class="theme-switch" type="button" hidden>
								<svg aria-hidden="true" viewBox="0 0 24 24">
									<circle cx="12" cy="12" r="4" />
									<path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
								</svg>
							</button>
						</div>
						<details class="navigation-menu">
							<summary>
								<span class="visually-hidden">Valikko</span>
								<svg aria-hidden="true" viewBox="0 0 24 24">
									<path d="M4 6h16M4 12h16M4 18h16" />
								</svg>
							</summary>
							<div class="navigation-items">
								<a href="/archive">{m.archive}</a>
								<a href="/about">{m.about}</a>
								<button class="theme-switch" type="button" hidden>
									<svg aria-hidden="true" viewBox="0 0 24 24">
										<circle cx="12" cy="12" r="4" />
										<path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
									</svg>
								</button>
							</div>
						</details>
					</nav>
				</header>
				<main>{children}</main>
			</body>
		</html>
	</>
);
