// Content files and token substitution.
//
//   menu/<device>/menu.json   pages/<device>/<pid>.json   sidebars/<device>/<pid>.json
//   widgets/<device>/<id>.html      plain widget, returned as final HTML (index 5)
//   widgets/<device>/<id>.il.json   BasisCore IL, rendered by BasisCore.Server.Node (index 1)
//
// Tokens replaced here:
//   JSON        "[##mid##]"  "[##dmnid##]"  [##rkey##]  [##t.<key>##]
//   widgets     [##cms.cms.rkey|cms.cookie.rkey##]  [##cms.cms.dmnid##]  [##module.baseurl##]
//               [##module.stylesheet##]  [##module.culture##]  [##module.dir##]  [##t.<key>##]
// In IL widgets, [##cms.cms.*##] values are resolved by the BasisCore render engine instead.
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { CONFIG, ROOT } from "./config.js";

const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const ASSET_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const ASSET_MIME = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const RTL = new Set(["fa", "ar", "he", "ur"]);
const TRANSLATION = /\[##t\.([A-Za-z0-9_.]+)##\]/g;
const translations = new Map();

export const isSegment = (value) => SEGMENT.test(String(value ?? ""));

export function cultureOf(value) {
  const culture = String(value || "en").toLowerCase();
  return existsSync(join(ROOT, "i18n", `${culture}.json`)) ? culture : "en";
}

function t(culture) {
  if (!translations.has(culture)) {
    translations.set(culture, JSON.parse(readFileSync(join(ROOT, "i18n", `${culture}.json`), "utf8")));
  }
  return translations.get(culture);
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const escapeJson = (text) => JSON.stringify(String(text)).slice(1, -1);

// Device folders are lower-case; the panel may send "Desktop".
const contentPath = (folder, device, name) => join(ROOT, folder, String(device).toLowerCase(), name);

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function moduleTokens(culture) {
  return {
    "[##module.baseurl##]": `${CONFIG.publicBaseUrl}/${CONFIG.prefix}`,
    "[##module.stylesheet##]": CONFIG.stylesheetUrl || `${CONFIG.publicBaseUrl}/${CONFIG.prefix}/asset/notes.css`,
    "[##module.culture##]": culture,
    "[##module.dir##]": RTL.has(culture) ? "rtl" : "ltr",
  };
}

/** Read a JSON content file and substitute its tokens. Returns null when the file is missing. */
export function readJson(folder, device, name, scope, culture) {
  let text = readIfExists(contentPath(folder, device, name));
  if (text === null) return null;
  const dictionary = t(culture);
  text = text.replace(TRANSLATION, (_, key) => escapeJson(dictionary[key] ?? key));
  // The quotes are part of the token: the result is a JSON number.
  text = text.replaceAll('"[##mid##]"', String(CONFIG.moduleId));
  text = text.replaceAll('"[##dmnid##]"', String(scope.currentDmnid));
  text = text.replaceAll("[##rkey##]", scope.rkey);
  return JSON.parse(text);
}

/**
 * Read a widget. Returns { kind: "html", content } or { kind: "il", il } or null.
 */
export function readWidget(device, widgetId, scope, culture) {
  const dictionary = t(culture);
  const tokens = moduleTokens(culture);

  const il = readIfExists(contentPath("widgets", device, `${widgetId}.il.json`));
  if (il !== null) {
    let text = il.replace(TRANSLATION, (_, key) => escapeJson(escapeHtml(dictionary[key] ?? key)));
    for (const [token, value] of Object.entries(tokens)) text = text.replaceAll(token, escapeJson(value));
    return { kind: "il", il: JSON.parse(text) };
  }

  let html = readIfExists(contentPath("widgets", device, `${widgetId}.html`));
  if (html === null) return null;
  html = html.replace(TRANSLATION, (_, key) => escapeHtml(dictionary[key] ?? key));
  const all = {
    ...tokens,
    "[##cms.cms.rkey|cms.cookie.rkey##]": scope.rkey,
    "[##cms.cms.dmnid##]": String(scope.currentDmnid),
  };
  for (const [token, value] of Object.entries(all)) html = html.replaceAll(token, value);
  return { kind: "html", content: html };
}

/** Single path segment, text types only (css, js, json, svg). Returns null when not served. */
export function readAsset(fileName) {
  const extension = extname(String(fileName)).toLowerCase();
  if (!ASSET_NAME.test(String(fileName)) || !(extension in ASSET_MIME)) return null;
  const content = readIfExists(join(ROOT, "assets", fileName));
  return content === null ? null : { mime: ASSET_MIME[extension], content };
}

export function readDevShell() {
  return readFileSync(join(ROOT, "dev", "shell.html"), "utf8")
    .replaceAll("[##module.baseurl##]", `${CONFIG.publicBaseUrl}/${CONFIG.prefix}`);
}
