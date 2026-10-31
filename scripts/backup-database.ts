import { databaseEnvironment } from "../src/env.js";
import { createDatabaseBackup } from "./database-backup.js";

console.log(
	`Created Turso backup at ${await createDatabaseBackup(databaseEnvironment(process.env))}`,
);
