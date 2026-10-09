import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Both src/config and dist/config are two levels below the project root.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
