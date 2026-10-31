export const ARCHIVE_BATCH_LIMIT = 20;
export const isValidPage = (raw: string | undefined) =>
	raw !== undefined && /^[1-9]\d{0,5}$/.test(raw);
export function parseArchiveRange(
	page: string | undefined,
	through: string | undefined,
) {
	if (
		(page !== undefined && !isValidPage(page)) ||
		(through !== undefined && (!isValidPage(through) || page === undefined))
	)
		return null;
	const start = page ? Number(page) : 1;
	const end = through ? Number(through) : start;
	return end >= start && end - start < ARCHIVE_BATCH_LIMIT
		? { start, end }
		: null;
}

export function archiveQuery(page?: number, through?: number, tag?: string) {
	const parts: string[] = [];
	if (page && (page !== 1 || (through && through > 1))) {
		parts.push(`page=${page}`);
		if (through && through > page) parts.push(`through=${through}`);
	}
	if (tag) parts.push(`tag=${encodeURIComponent(tag)}`);
	return parts.length ? `?${parts.join("&")}` : "";
}
