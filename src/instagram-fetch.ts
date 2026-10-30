export async function fetchWithRetry(
	fetcher: typeof fetch,
	url: URL,
	init: RequestInit,
): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const response = await fetcher(url, {
			...init,
			signal: AbortSignal.timeout(15000),
			redirect: "error",
		});
		if (attempt >= 2 || (response.status !== 429 && response.status < 500))
			return response;
		const retryAfter = response.headers.get("retry-after");
		let delay = 1000 * 2 ** attempt;
		if (retryAfter) {
			const seconds = Number(retryAfter);
			const date = Date.parse(retryAfter);
			delay = Number.isFinite(seconds)
				? seconds * 1000
				: Number.isFinite(date)
					? Math.max(0, date - Date.now())
					: 6000;
		}
		if (delay < 0 || delay > 5000) return response;
		await response.body?.cancel();
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}
