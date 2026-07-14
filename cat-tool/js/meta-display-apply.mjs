/**
 * Vitest / Node ESM shim：載入瀏覽器 IIFE 後再 export。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { MetaItemsCollector } from "./meta-items-collector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, "meta-display-apply.js"), "utf8");
const sandbox = {
  console,
  MetaItemsCollector,
  ExtraInfoDisplay: globalThis.ExtraInfoDisplay,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(code, sandbox);
const api = sandbox.MetaDisplayApply;

export const normalizeMetaDisplayConfig = api.normalizeMetaDisplayConfig;
export const applyMetaDisplay = api.applyMetaDisplay;
export const buildMetaExtraChipsCellHtml = api.buildMetaExtraChipsCellHtml;
export const MetaDisplayApply = api;
export default api;
