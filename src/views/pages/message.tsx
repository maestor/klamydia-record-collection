import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import { Layout } from "../layout.js";

export const MessagePage: FC<{ title: string; message: string }> = ({
	title,
	message,
}) => (
	<Layout title={title}>
		<h1>{message}</h1>
		<a href="/archive">{m.goArchive}</a>
	</Layout>
);
