import type { Client } from "@libsql/client";
import { collectionFolders } from "../discogs-folders.js";

export async function getCollectionCounts(db: Client) {
	const { rows } = await db.execute(
		"SELECT folder_id, COUNT(*) AS copies FROM discogs_copies GROUP BY folder_id",
	);
	const copies = new Map(
		rows.map((row) => [Number(row.folder_id), Number(row.copies)]),
	);
	const folders = collectionFolders.map(({ id, category }) => ({
		category,
		count: copies.get(id) ?? 0,
	}));
	return {
		total: folders.reduce((sum, folder) => sum + folder.count, 0),
		folders,
	};
}

export type CollectionCounts = Awaited<ReturnType<typeof getCollectionCounts>>;
