/**
 * Resolve the node-canvas package shipped under 4d-renderer/.
 * Root install may not hoist `canvas`; tutorials import through this helper.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "4d-renderer", "package.json"));
export const { createCanvas } = require("canvas");
