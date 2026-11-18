export function releaseId(value: string) {
	const url = URL.parse(value);
	const match = url?.pathname.match(
		/^\/(?:[a-z]{2}(?:_[A-Z]{2})?\/)?release\/([1-9]\d*)(?:-[^/]+)?\/?$/,
	);
	const id = Number(match?.[1]);
	if (
		!url ||
		!["https://www.discogs.com", "https://discogs.com"].includes(url.origin) ||
		!Number.isSafeInteger(id)
	)
		throw new Error(
			"Anna Discogs-julkaisun osoite, esimerkiksi https://www.discogs.com/release/12345",
		);
	return id;
}
