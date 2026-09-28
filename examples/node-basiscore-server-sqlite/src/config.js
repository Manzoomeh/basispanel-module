// Configuration from environment variables (and an optional .env file beside package.json).
// Registration values (module id, allowed businesses, origins) are platform data: never guessed.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    if (!(key in process.env)) process.env[key] = line.slice(at + 1).trim();
  }
}

const flag = (name, fallback = "0") =>
  ["1", "true", "yes", "on"].includes(String(process.env[name] ?? fallback).trim().toLowerCase());

const list = (name) =>
  String(process.env[name] ?? "")
    .split(/[,;]/)
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);

loadDotenv(join(ROOT, ".env"));

const host = process.env.NOTES_HOST || "127.0.0.1";
const port = Number(process.env.NOTES_PORT || 8792);
// BasisCore.Server.Node rejects requests whose Host header is an IP address,
// so the default public URL uses "localhost".
const publicBaseUrl = (process.env.NOTES_PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");

export const CONFIG = Object.freeze({
  prefix: process.env.NOTES_PREFIX || "notes",
  host,
  port,
  publicBaseUrl,
  // Registered module id (mid). 0 = not registered yet.
  moduleId: Number(process.env.NOTES_MODULE_ID || 0),
  // Businesses (currentDmnid) the module answers. Empty = no gate (development only).
  allowedDmnIds: new Set(list("NOTES_ALLOWED_DMN_IDS").map(Number)),
  // Browser origins allowed to call this module (the panel's origin).
  allowedOrigins: new Set(list("NOTES_ALLOWED_ORIGINS")),
  checkRkeyApi: process.env.CHECK_RKEY_API || "https://api.trust-login.com/checkrkey/",
  // Accept the session key "dev" without calling TrustLogin. Never enable in production.
  mockAuth: flag("NOTES_MOCK_AUTH"),
  // Serve the local shell simulator at /dev/shell. Never enable in production.
  devShell: flag("NOTES_DEV_SHELL"),
  // Shared platform stylesheet. Empty = this module's demo stylesheet.
  stylesheetUrl: process.env.NOTES_STYLESHEET_URL || "",
  dbPath: process.env.NOTES_DB_PATH || join(ROOT, "data", "notes.sqlite3"),
});
