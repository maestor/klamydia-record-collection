import type { FC, PropsWithChildren } from "hono/jsx";

type PageHeadingProps = PropsWithChildren<{
	label: string;
	titleClass?: string;
}>;

export const PageHeading: FC<PageHeadingProps> = ({
	label,
	titleClass,
	children,
}) => (
	<>
		<p class="eyebrow">{label}</p>
		<h1 class={titleClass}>{children}</h1>
	</>
);
