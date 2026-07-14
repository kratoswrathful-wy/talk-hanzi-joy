/**
 * Vitest / Node ESM shim：載入瀏覽器 IIFE 後再 export。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, "meta-items-collector.js"), "utf8");
const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(code, sandbox);
const api = sandbox.MetaItemsCollector;

export const itemKey = api.itemKey;
export const normalizeMetaItems = api.normalizeMetaItems;
export const collectFromTransUnit = api.collectFromTransUnit;
export const collectFromXliff2Unit = api.collectFromXliff2Unit;
export const summarizeMetaItemKinds = api.summarizeMetaItemKinds;
export const MetaItemsCollector = api;
export default api;
