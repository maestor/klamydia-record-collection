import { setTimeout as delay } from "node:timers/promises";
import type { Client, InStatement } from "@libsql/client";

import { collectionFolders } from "./discogs-folders.js";

const collection = "/users/maestor/collection";
type DiscogsRequest = (url: string, options: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;
type CollectionCopy = { releaseId: number; folderId: number; data: string };

function object(value: unknown): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid Discogs object");
	return Object.fromEntries(Object.entries(value));
}
function objects(value: unknown) {
	if (!Array.isArray(value)) throw new Error("Invalid Discogs list");
	return value.map(object);
}
function integer(value: unknown, min: number) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
		throw new Error("Invalid Discogs integer");
	return value;
}
function name(value: unknown) {
	if (typeof value !== "string" || !value.trim())
		throw new Error("Missing Discogs name or title");
	return value;
}

function discogsReader(
	token: string,
	request: DiscogsRequest,
	wait: (ms: number) => Promise<void>,
) {
	return async function read(path: string) {
		for (let attempt = 1; ; attempt++) {
			const response = await request(`https://api.discogs.com${path}`, {
				headers: {
					Authorization: `Discogs token=${token}`,
					"User-Agent": "Klamydiakokoelma/0.1",
				},
				redirect: "error",
				signal: AbortSignal.timeout(30000),
			});
			if ([429, 502, 503, 504].includes(response.status) && attempt < 4) {
				await response.body?.cancel();
				const seconds = Number(response.headers.get("Retry-After"));
				const fallback = response.status === 429 ? 60 : attempt * 2;
				await wait(
					(Number.isFinite(seconds) && seconds > 0 ? seconds : fallback) * 1000,
				);
				continue;
			}
			if (!response.ok)
				throw new Error(`Discogs ${path} returned HTTP ${response.status}`);
			const result = object(await response.json());
			if (response.headers.get("X-Discogs-Ratelimit-Remaining") === "0")
				await wait(60000);
			return result;
		}
	};
}

async function readFolderCopies(
	read: ReturnType<typeof discogsReader>,
	folderId: number,
	count: number,
	instances: Map<number, CollectionCopy>,
) {
	const initialSize = instances.size;
	for (let page = 1; ; page++) {
		const result = await read(
			`${collection}/folders/${folderId}/releases?per_page=100&page=${page}&sort=added&sort_order=asc`,
		);
		const pagination = object(result.pagination);
		const pages = integer(pagination.pages, 0);
		if (
			pagination.page !== page ||
			pagination.items !== count ||
			pages > Math.max(1, count)
		)
			throw new Error(
				`Discogs pagination changed for folder ${folderId}. Run again.`,
			);
		for (const item of objects(result.releases)) {
			const id = integer(item.instance_id, 1);
			const releaseId = integer(item.id, 1);
			if (item.folder_id !== folderId || instances.has(id))
				throw new Error(
					`Unexpected Discogs folder or duplicate copy ${id}. Run again.`,
				);
			instances.set(id, { releaseId, folderId, data: JSON.stringify(item) });
		}
		if (page >= pages) break;
	}
	if (instances.size - initialSize !== count)
		throw new Error(`Incomplete Discogs folder ${folderId}. Run again.`);
}

export async function importDiscogs(
	db: Client,
	token: string,
	request: DiscogsRequest = fetch,
	wait: (ms: number) => Promise<void> = delay,
) {
	if (!token.trim()) throw new Error("DISCOGS_ACCESS_TOKEN is required");
	await db.execute("SELECT instance_id FROM discogs_copies LIMIT 0");
	const read = discogsReader(token, request, wait);
	const folders = objects((await read(`${collection}/folders`)).folders);
	const fields = objects((await read(`${collection}/fields`)).fields);
	const statements: InStatement[] = [
		"DELETE FROM discogs_copies",
		"DELETE FROM discogs_releases",
		"DELETE FROM discogs_folders",
		"DELETE FROM discogs_fields",
	];
	for (const field of fields)
		statements.push({
			sql: "INSERT INTO discogs_fields(field_id,name,data) VALUES (?,?,?)",
			args: [integer(field.id, 1), name(field.name), JSON.stringify(field)],
		});
	const instances = new Map<number, CollectionCopy>();
	for (const { id: folderId } of collectionFolders) {
		const folder = folders.find((row) => row.id === folderId);
		if (!folder) throw new Error(`Discogs folder ${folderId} is missing`);
		const count = integer(folder.count, 0);
		statements.push({
			sql: "INSERT INTO discogs_folders(folder_id,name,data) VALUES (?,?,?)",
			args: [folderId, name(folder.name), JSON.stringify(folder)],
		});
		await readFolderCopies(read, folderId, count, instances);
	}
	const releases = new Set(
		Array.from(instances.values(), (copy) => copy.releaseId),
	);
	for (const releaseId of releases) {
		const release = await read(`/releases/${releaseId}`);
		if (release.id !== releaseId)
			throw new Error(`Wrong Discogs release returned for ${releaseId}`);
		statements.push({
			sql: "INSERT INTO discogs_releases(release_id,title,data) VALUES (?,?,?)",
			args: [releaseId, name(release.title), JSON.stringify(release)],
		});
	}
	for (const [id, copy] of instances)
		statements.push({
			sql: "INSERT INTO discogs_copies(instance_id,release_id,folder_id,data) VALUES (?,?,?,?)",
			args: [id, copy.releaseId, copy.folderId, copy.data],
		});
	await db.batch(statements, "write");
	return {
		folders: collectionFolders.length,
		copies: instances.size,
		releases: releases.size,
	};
}
