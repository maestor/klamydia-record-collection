const normalizeTitle = (value: string) =>
	value.normalize("NFC").trim().replace(/\s+/gu, " ");

export function presentDescription(title: string, description: string) {
	const lines = description.split(/\r?\n/u);
	const first = lines.findIndex((line) => line.trim().length > 0);
	const omittedTitle =
		first >= 0 &&
		normalizeTitle(title) !== "" &&
		normalizeTitle(lines[first]) === normalizeTitle(title);
	if (omittedTitle) lines.splice(0, first + 1);
	const text = lines
		.filter((line) => !/^\s*(?:#[\p{L}\p{N}_]+\s*)+$/u.test(line))
		.map((line) =>
			line.replace(/(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]+)/gu, "$1$2"),
		)
		.join("\n")
		.trim();
	return { text, omittedTitle };
}
