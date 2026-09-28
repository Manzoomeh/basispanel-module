// Check every widget against the seven widget rules and the content-file contract.
//
//   npm run check
//
// Runs without the service. Plain widgets (.html) and BasisCore IL widgets (.il.json) are both
// checked; for IL widgets the HTML is taken from the rawtext commands and the print faces.
// R4 is also checked the mechanical way: the script is concatenated with itself and compiled.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";
import { ROOT } from "../src/config.js";

const failures = [];
const fail = (where, rule, detail) => failures.push(`${where}: ${rule} - ${detail}`);
const SCRIPT = /<script[^>]*>([\s\S]*?)<\/script>/gi;
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function textOf(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (value && value.Params) return "TOKEN"; // a render-engine token
  return "";
}

// Flatten an IL tree to the HTML it produces (tokens and faces as placeholders).
function ilToHtml(node) {
  if (!node || typeof node !== "object") return "";
  const type = String(node.$type || node.core || "").toLowerCase();
  if (type === "rawtext") return textOf(node.content);
  if (type === "print") return (node.faces || []).map((face) => textOf(face.content)).join("");
  return (node.Commands || []).map(ilToHtml).join("");
}

function checkIl(where, node) {
  const type = String(node?.$type || "").toLowerCase();
  if (type === "dbsource") {
    if (!node.ConnectionName) fail(where, "IL", `dbsource '${node.name}' has no ConnectionName`);
    if (!Array.isArray(node.Members) || node.Members.length === 0) fail(where, "IL", `dbsource '${node.name}' has no Members`);
  }
  for (const child of node?.Commands || []) checkIl(where, child);
}

function topLevelDeclarations(script) {
  const cleaned = script.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
  let depth = 0;
  const found = [];
  for (const match of cleaned.matchAll(/[{}]|\b(?:const|let)\s+[A-Za-z_$][\w$]*/g)) {
    if (match[0] === "{") depth++;
    else if (match[0] === "}") depth--;
    else if (depth === 0) found.push(match[0]);
  }
  return found;
}

function checkHtml(where, html) {
  const markup = html.replace(SCRIPT, "");
  const scripts = [...html.matchAll(SCRIPT)].map((m) => m[1]).join("\n");

  if (/<style\b/i.test(markup)) fail(where, "R1", "<style> block present");
  for (const [, url] of markup.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    if (!/^(https?:\/\/|\[##|#|mailto:)/.test(url)) fail(where, "R2", `relative URL '${url}'`);
  }
  if (/fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg/i.test(html)) fail(where, "R3", "external asset host");
  for (const declaration of topLevelDeclarations(scripts)) fail(where, "R4", `top-level '${declaration}'`);
  const rootId = /<div[^>]*\bid="([^"]+)"/.exec(markup)?.[1];
  if (!rootId) fail(where, "R5", "no root element with an id");
  else if (scripts.trim() && !scripts.includes(`'#${rootId}'`)) fail(where, "R5", `script does not query from root #${rootId}`);
  if (scripts.trim() && !/window\.[A-Z0-9_]+_BUILD\s*=/.test(scripts)) fail(where, "R6", "no build marker window.<NAME>_BUILD");
  if (/<basis\b(?![^>]*run="AtClient")[^>]*triggers=/i.test(html)) fail(where, "R7", 'client-side <basis> without run="AtClient"');
  if (GUID.test(html)) fail(where, "security", "literal GUID (possible session key) in the file");
  if (scripts.trim()) {
    try {
      new vm.Script(`${scripts}\n${scripts}`);
    } catch (ex) {
      fail(where, "R4", `script fails when executed twice: ${ex.message}`);
    }
  }
}

function checkContent(widgetIds) {
  const menu = JSON.parse(readFileSync(join(ROOT, "menu", "desktop", "menu.json"), "utf8"));
  const pids = new Set();
  const walk = (nodes = []) => {
    for (const node of nodes) {
      if (node.mid !== "[##mid##]") fail("menu/desktop/menu.json", "mid", `node '${node.title}' must use "[##mid##]"`);
      if ("pid" in node) pids.add(String(node.pid));
      walk(node.nodes);
    }
  };
  walk(menu.nodes);
  for (const pid of pids) {
    let page;
    try {
      page = JSON.parse(readFileSync(join(ROOT, "pages", "desktop", `${pid}.json`), "utf8"));
    } catch {
      fail("menu/desktop/menu.json", "pid", `page ${pid} has no pages/desktop/${pid}.json`);
      continue;
    }
    for (const group of page.groups || []) {
      for (const widget of group.widgets || []) {
        if (widget.moduleid !== "[##mid##]") fail(`pages/desktop/${pid}.json`, "moduleid", "must equal the menu mid token");
        if (!widgetIds.has(String(widget.id))) fail(`pages/desktop/${pid}.json`, "widget", `widget ${widget.id} has no file`);
      }
    }
  }
}

const dir = join(ROOT, "widgets", "desktop");
const widgetIds = new Set();
let count = 0;
for (const name of readdirSync(dir).sort()) {
  const path = join(dir, name);
  const where = relative(ROOT, path).replaceAll("\\", "/");
  if (name.endsWith(".il.json")) {
    const il = JSON.parse(readFileSync(path, "utf8"));
    checkIl(where, il);
    checkHtml(where, ilToHtml(il));
    widgetIds.add(name.replace(".il.json", ""));
    count++;
  } else if (name.endsWith(".html")) {
    checkHtml(where, readFileSync(path, "utf8"));
    widgetIds.add(name.replace(".html", ""));
    count++;
  }
}
checkContent(widgetIds);

console.log(`checked ${count} widgets`);
for (const line of failures) console.log("FAIL", line);
console.log(failures.length ? `${failures.length} problem(s)` : "OK");
process.exit(failures.length ? 1 : 0);
