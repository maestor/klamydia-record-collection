import { cleanupAssets } from "./cleanup-assets.js";

const removed = await cleanupAssets(process.cwd());
if (removed.length === 0) console.log("No unused hashed assets found.");
else {
	for (const name of removed) console.log(`Removed public/assets/${name}`);
	console.log(`Removed ${removed.length} unused hashed asset(s).`);
}
