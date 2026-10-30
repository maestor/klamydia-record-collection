import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
	type GetObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import {
	downloadVerifiedObject,
	putImmutable,
	retryTransient,
	verifyObject,
} from "../scripts/r2-store.js";
import { r2Address, r2Reader } from "../src/r2-reader.js";

it("writes once and verifies the remote bytes, including when the object already exists", async () => {
	const bytes = Buffer.from("image data");
	const filename = `${createHash("sha256").update(bytes).digest("hex")}.jpg`;
	let saved: Buffer | undefined;
	const client = {
		send: async (command: PutObjectCommand | GetObjectCommand) => {
			if (command instanceof PutObjectCommand) {
				expect(command.input.IfNoneMatch).toBe("*");
				if (saved) throw { $metadata: { httpStatusCode: 412 } };
				saved = Buffer.from(command.input.Body as Buffer);
				return {};
			}
			return { ContentLength: saved?.length, Body: Readable.from([saved]) };
		},
	} as unknown as S3Client;
	const address = { endpoint: "https://example.invalid", bucket: "collection" };
	await putImmutable(client, address, filename, bytes);
	await putImmutable(client, address, filename, bytes);
	expect(await downloadVerifiedObject(client, address, filename)).toEqual(
		bytes,
	);
	saved = Buffer.from("wrong data");
	await expect(verifyObject(client, address, filename, bytes)).rejects.toThrow(
		"hash mismatch",
	);
	await expect(
		downloadVerifiedObject(client, address, filename),
	).rejects.toThrow("hash mismatch");
});

it("retries transient R2 errors but stops immediately on authorization or integrity failures", async () => {
	let attempts = 0;
	const delays: number[] = [];
	await retryTransient(
		async () => {
			if (++attempts < 3) throw new Error("R2 upload failed (HTTP unknown).");
		},
		async (ms) => {
			delays.push(ms);
		},
	);
	expect(attempts).toBe(3);
	expect(delays).toEqual([1000, 2000]);
	for (const message of [
		"R2 upload failed (HTTP 403).",
		"R2 object hash mismatch: file",
	]) {
		attempts = 0;
		await expect(
			retryTransient(
				async () => {
					attempts++;
					throw new Error(message);
				},
				async () => {},
			),
		).rejects.toThrow(message);
		expect(attempts).toBe(1);
	}
});

it("generates a signed R2 URL from read credentials and rejects invalid endpoint configuration", async () => {
	const env = {
		R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
		R2_BUCKET: "collection",
		R2_READ_ACCESS_KEY_ID: "read-key",
		R2_READ_SECRET_ACCESS_KEY: "read-secret",
	};
	const reader = r2Reader(env);
	const url = new URL(await reader.sign(`${"b".repeat(64)}.jpg`));
	expect(url.origin).toBe(env.R2_ENDPOINT);
	expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
	expect(
		r2Address({
			...env,
			R2_ENDPOINT: `https://${"a".repeat(32)}.eu.r2.cloudflarestorage.com`,
		}).endpoint,
	).toContain(".eu.r2.");
	expect(url.pathname).toContain("/collection/media/");
	expect(() =>
		r2Address({ ...env, R2_ENDPOINT: "https://example.test" }),
	).toThrow("R2_ENDPOINT");
	expect(() => r2Address({ ...env, R2_ENDPOINT: "not-a-url" })).toThrow(
		"R2_ENDPOINT",
	);
	expect(() => r2Address({ ...env, R2_BUCKET: "invalid/bucket" })).toThrow(
		"R2_BUCKET",
	);
	expect(() => r2Reader({ ...env, R2_READ_SECRET_ACCESS_KEY: "" })).toThrow(
		"credentials",
	);
	expect(() => reader.sign("../not-an-image")).toThrow("filename");
});
