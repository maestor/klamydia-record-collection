import type { FC, PropsWithChildren } from "hono/jsx";
import { locale, messages as m } from "#i18n/fi";

type LayoutProps = PropsWithChildren<{
	title: string;
	canonical?: string;
	description?: string;
	archive?: boolean;
	gallery?: boolean;
}>;

export const Layout: FC<LayoutProps> = ({
	title,
	canonical,
	description,
	archive,
	gallery,
	children,
}) => (
	<html lang={locale.language}>
		<head>
			<meta charSet="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="description" content={description || m.defaultDescription} />
			<title>{title} | Klamydiakokoelma</title>
			{canonical && <link rel="canonical" href={canonical} />}
			<link rel="stylesheet" href="/assets/style-b5bccb7b.css" />
			<script src="/assets/images-cc5a7637.js" defer></script>
			{gallery && <script src="/assets/gallery-d693c11e.js" defer></script>}
			{archive && (
				<>
					<script src="/assets/htmx-d6fdc75f.js" defer></script>
					<script src="/assets/archive-7e74fb84.js" defer></script>
				</>
			)}
		</head>
		<body>
			<header>
				<a href="/">Klamydiakokoelma</a>
				<nav aria-label={m.navigation}>
					<a href="/archive">{m.archive}</a>
					<a href="/about">{m.about}</a>
				</nav>
			</header>
			<main>{children}</main>
		</body>
	</html>
);
