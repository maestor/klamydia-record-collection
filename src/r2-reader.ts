import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2Address = { endpoint: string; bucket: string };

export function r2Address(env: NodeJS.ProcessEnv): R2Address {
	let url: URL;
	try {
		url = new URL(env.R2_ENDPOINT ?? "");
	} catch {
		throw new Error("R2_ENDPOINT must be the account's HTTPS R2 S3 endpoint.");
	}
	if (
		url.protocol !== "https:" ||
		!/^[a-f0-9]{32}\.(?:(?:eu|us|fedramp)\.)?r2\.cloudflarestorage\.com$/.test(
			url.hostname,
		) ||
		url.port ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		throw new Error("R2_ENDPOINT must be the account's HTTPS R2 S3 endpoint.");
	const bucket = env.R2_BUCKET ?? "";
	if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
		throw new Error("R2_BUCKET must be a valid R2 bucket name.");
	return { endpoint: url.origin, bucket };
}

export function r2Client(
	address: R2Address,
	accessKeyId: string | undefined,
	secretAccessKey: string | undefined,
) {
	if (!accessKeyId || !secretAccessKey)
		throw new Error("R2 credentials are missing.");
	return new S3Client({
		region: "auto",
		endpoint: address.endpoint,
		forcePathStyle: true,
		credentials: { accessKeyId, secretAccessKey },
		maxAttempts: 3,
	});
}

export function r2Key(filename: string) {
	if (!/^[a-f0-9]{64}\.jpg$/.test(filename))
		throw new Error("Invalid R2 media filename.");
	return `collection/media/${filename}`;
}

export function r2Reader(env: NodeJS.ProcessEnv) {
	const address = r2Address(env);
	const client = r2Client(
		address,
		env.R2_READ_ACCESS_KEY_ID,
		env.R2_READ_SECRET_ACCESS_KEY,
	);
	return {
		endpoint: address.endpoint,
		sign: (filename: string) =>
			getSignedUrl(
				client,
				new GetObjectCommand({ Bucket: address.bucket, Key: r2Key(filename) }),
				{ expiresIn: 3600 },
			),
	};
}
