import { createHash } from "node:crypto";
import {
	GetObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { type R2Address, r2Key } from "../src/r2-reader.js";

export async function retryTransient(
	operation: () => Promise<void>,
	wait = (ms: number) =>
		new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
	for (let attempt = 0; ; attempt++) {
		try {
			await operation();
			return;
		} catch (error) {
			const status = (error as { $metadata?: { httpStatusCode?: number } })
				.$metadata?.httpStatusCode;
			const message = error instanceof Error ? error.message : "";
			const transient = message.startsWith("R2 upload failed")
				? /^R2 upload failed \(HTTP (?:unknown|429|5\d\d)\)/.test(message)
				: status === 429 ||
					(status !== undefined && status >= 500) ||
					(status === undefined &&
						!/^R2 object (?:size|hash) mismatch/.test(message));
			if (attempt >= 2 || !transient) throw error;
			await wait((attempt + 1) * 1000);
		}
	}
}

export async function verifyObject(
	client: S3Client,
	address: R2Address,
	filename: string,
	bytes: Buffer,
) {
	const response = await client.send(
		new GetObjectCommand({ Bucket: address.bucket, Key: r2Key(filename) }),
		{ abortSignal: AbortSignal.timeout(30000) },
	);
	if (!response.Body || response.ContentLength !== bytes.length)
		throw new Error(`R2 object size mismatch: ${filename}`);
	const hash = createHash("sha256");
	let size = 0;
	for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
		size += chunk.length;
		if (size > bytes.length)
			throw new Error(`R2 object size mismatch: ${filename}`);
		hash.update(chunk);
	}
	if (size !== bytes.length || hash.digest("hex") !== filename.slice(0, -4))
		throw new Error(`R2 object hash mismatch: ${filename}`);
}

export async function downloadVerifiedObject(
	client: S3Client,
	address: R2Address,
	filename: string,
) {
	const response = await client.send(
		new GetObjectCommand({ Bucket: address.bucket, Key: r2Key(filename) }),
		{ abortSignal: AbortSignal.timeout(30000) },
	);
	if (
		!response.Body ||
		!response.ContentLength ||
		response.ContentLength > 15_000_000
	)
		throw new Error(`R2 object size invalid: ${filename}`);
	const parts: Buffer[] = [];
	let size = 0;
	const hash = createHash("sha256");
	for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
		size += chunk.length;
		if (size > response.ContentLength)
			throw new Error(`R2 object size invalid: ${filename}`);
		hash.update(chunk);
		parts.push(Buffer.from(chunk));
	}
	if (
		size !== response.ContentLength ||
		hash.digest("hex") !== filename.slice(0, -4)
	)
		throw new Error(`R2 object hash mismatch: ${filename}`);
	return Buffer.concat(parts);
}

export async function putImmutable(
	client: S3Client,
	address: R2Address,
	filename: string,
	bytes: Buffer,
) {
	if (
		createHash("sha256").update(bytes).digest("hex") !== filename.slice(0, -4)
	)
		throw new Error("Invalid content hash.");
	try {
		await client.send(
			new PutObjectCommand({
				Bucket: address.bucket,
				Key: r2Key(filename),
				Body: bytes,
				ContentType: "image/jpeg",
				CacheControl: "public, max-age=31536000, immutable",
				IfNoneMatch: "*",
			}),
			{ abortSignal: AbortSignal.timeout(30000) },
		);
	} catch (error) {
		const status = (error as { $metadata?: { httpStatusCode?: number } })
			.$metadata?.httpStatusCode;
		if (status !== 412)
			throw new Error(`R2 upload failed (HTTP ${status ?? "unknown"}).`);
	}
	await verifyObject(client, address, filename, bytes);
}
